package Oahu.Core

import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text
import System.Text.RegularExpressions
import System.Threading
import System.Threading.Tasks
import Microsoft.EntityFrameworkCore
import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.BooksDatabase
import Oahu.BooksDatabase.Ex
import Oahu.Core.Ex
import Oahu.Aux.Logging
import R = Oahu.Core.Properties.Resources
import Oahu.Audible.Json

internal class BookLibrary : IBookLibrary {
    let DbDir string? = nil
    let ImgDir string = Path.Combine(ApplEnv.LocalApplDirectory, "img")
    let BookCache Dictionary[ProfileId, IEnumerable[Book]] = Dictionary[ProfileId, IEnumerable[Book]]()
    private var syncContext SynchronizationContext?

    init(dbDir string? = nil) {
        this.DbDir = dbDir
        syncContext = SynchronizationContext.Current
    }

    async func SinceLatestPurchaseDateAsync(profileId ProfileId, resync bool) DateTime {
        return await Task.Run(() -> SinceLatestPurchaseDate(profileId, resync))
    }

    async func AddRemBooksAsync(libProducts List[Product], profileId ProfileId, resync bool) {
        using let logGuard = LogGuard(3, this, () -> "#items=${libProducts.Count}, resync=$resync")
        await Task.Run(() -> AddRemBooks(libProducts, profileId, resync))
        await Task.Run(() -> CleanupDuplicateAuthors())
    }

    async func AddCoverImagesAsync(downloadFunc async (string?) -> []uint8) {
        using let logGuard = LogGuard(3, this)
        Directory.CreateDirectory(ImgDir)
        using let dbContext = BookDbContextLazyLoad(DbDir)
        let files = Directory.GetFiles(ImgDir)
        let books = dbContext.Books
            .ToList()
            .Where((c Book) -> c.CoverImageFile == nil || !files.Contains(c.CoverImageFile!!))
            .ToList()
        Log(3, this, () -> "#img=${books.Count}")
        for book in books {
            Log(3, this, () -> book.ToString())
            let url string? = book.CoverImageUrl
            if url == nil {
                continue
            }
            let img[]?uint8 = await downloadFunc(url)
            if img == nil {
                continue
            }
            let ext string? = img.FindImageFormat()
            if ext == nil {
                continue
            }
            let filename = "${book.Asin}$ext"
            let path = Path.Combine(ImgDir, filename)
            try {
                await File.WriteAllBytesAsync(path, img)
                book.CoverImageFile = path
            } catch (Exception) { }
        }
        dbContext.SaveChanges()
    }

    func GetBooks(profileId ProfileId) IEnumerable[Book] {
        using let logGuard = LogGuard(3, this, () -> profileId.ToString())
        lock BookCache {
            let succ = BookCache.TryGetValue(profileId, out var cached)
            if succ {
                Log(3, this, () -> "from cache, #books=${cached.Count()}")
                return cached
            }
        }
        using let dbContext = BookDbContext(DbDir)
        // using var rg = new ResourceGuard (x => dbContext.ChangeTracker.LazyLoadingEnabled = !x);
        let books IEnumerable[Book] = dbContext.Books
            .Include((b Book) -> b.Conversion)
            .Include((b Book) -> b.Components)
            .ThenInclude((c Component) -> c.Conversion)
            .Include((b Book) -> b.Authors)
            .Include((b Book) -> b.Narrators)
            .Include((b Book) -> b.Series)
            .ThenInclude((s SeriesBook) -> s.Series)
            .Include((b Book) -> b.Ladders)
            .ThenInclude((l Oahu.BooksDatabase.Ladder) -> l.Rungs)
            .ThenInclude((r Rung) -> r.Genre)
            .Include((b Book) -> b.Genres)
            .Include((b Book) -> b.Codecs)
            .ToList()
        let booksByProfile = books.Where(
            (b Book) -> b.Conversion!!.AccountId == profileId.AccountId && b.Conversion!!.Region == profileId.Region
        )
            .ToList()
        lock BookCache {
            BookCache[profileId] = booksByProfile
        }
        Log(3, this, () -> "from DB, #books=${booksByProfile.Count()}")
        return booksByProfile
    }

    func GetAccountAliases() IEnumerable[AccountAlias] {
        using let logGuard = LogGuard(3, this)
        using let dbContext = BookDbContextLazyLoad(DbDir)
        let accounts = dbContext.Accounts.ToList()
        let contexts = accounts.Select((a Account) -> AccountAlias(a.AudibleId!!, a.Alias)).ToList()
        Log(3, this, () -> "#contexts=${contexts.Count}")
        return contexts
    }

    func GetAccountId(profile IProfile?, newAlias bool) AccountAliasContext {
        using let logGuard = LogGuard(3, this)
        using let dbContext = BookDbContextLazyLoad(DbDir)
        let GetAliasHashes = func () List[uint32] {
            return dbContext.Accounts
                .ToList()
                .Where((a Account) -> !a.Alias.IsNullOrWhiteSpace())
                .Select((a Account) -> a.Alias.Checksum32())
                .ToList()
        }
        let accountId = profile!!.CustomerInfo!!.AccountId
        var account Account? = dbContext.Accounts.FirstOrDefault((a Account) -> a.AudibleId == accountId)
        if account == nil {
            let hashes = GetAliasHashes()
            account = Account{AudibleId: accountId}
            dbContext.Accounts.Add(account)
            dbContext.SaveChanges()
            return AccountAliasContext(account.Id, profile!!.CustomerInfo!!.Name, hashes)
        } else {
            if account.Alias.IsNullOrWhiteSpace() || newAlias {
                if newAlias {
                    return AccountAliasContext(account.Id, profile!!.CustomerInfo!!.Name, GetAliasHashes()){
                        Alias = account.Alias
                    }
                } else {
                    return AccountAliasContext(account.Id, profile!!.CustomerInfo!!.Name, GetAliasHashes())
                }
            } else {
                return AccountAliasContext(account.Id, nil, nil){Alias = account.Alias}
            }
        }
    }

    /// Marks a title as no longer available in the given profile's library, after Audible denied a
    /// license for entitlement reasons.
    /// @remarks A full resync reconciles the local library against the API and marks vanished titles
    /// removed,
    /// but only when the user next runs one. Applying the same flag at the point of denial keeps the
    /// title out of the default (available-only) listings straight away, so a book whose Amazon
    /// Household sharing was withdrawn stops being offered as downloadable.
    ///
    /// Conversion state is deliberately left untouched. The caller records
    /// (cref:EConversionState.LicenseDenied), which is more informative than the generic
    /// (cref:EConversionState.Unknown) the sync path uses, and already-downloaded content
    /// must keep its state either way.
    /// @returns `true` if the title was newly marked unavailable.
    func MarkBookUnavailable(asin string, profileId ProfileId) bool {
        if asin.IsNullOrWhiteSpace() {
            return false
        }
        using let logGuard = LogGuard(3, this, () -> "asin = $asin")
        using let dbContext = BookDbContextLazyLoad(DbDir)
        // Filter by profile in memory: Conversion is a lazy-loaded navigation property.
        let book Book? = dbContext.Books
            .Where((b Book) -> b.Asin == asin)
            .ToList()
            .FirstOrDefault(
            (b Book) -> b.Conversion != nil &&
                b.Conversion!!.AccountId == profileId.AccountId &&
                b.Conversion!!.Region == profileId.Region
        )
        if book == nil || (book.Deleted ?? false) {
            return false
        }
        book.Deleted = true
        dbContext.SaveChanges()
        lock BookCache {
            BookCache.Remove(profileId)
        }
        Log(1, this, () -> "marked unavailable: $book")
        return true
    }

    func RemoveAccountId(key IProfileKey) bool {
        using let logGuard = LogGuard(3, this, () -> "id = ${key.Id}")
        using let dbContext = BookDbContextLazyLoad(DbDir)
        let accountId string? = key.AccountId
        let account Account? = dbContext.Accounts.FirstOrDefault((a Account) -> a.AudibleId == accountId)
        if account == nil {
            return false
        }
        // Conversions reference Accounts.Id without a foreign key. Dropping the row while local
        // content still refers to it orphans that content, and registering the same Audible account
        // again allocates a fresh id, so the library would come back empty. Keep the id mapping and
        // only drop the alias in that case.
        let hasLocalContent = dbContext.Conversions.Any((c Conversion) -> c.AccountId == account.Id)
        if hasLocalContent {
            Log(3, this, () -> "id = ${account.Id} retained, local library content still references it")
            account.Alias = nil
            dbContext.SaveChanges()
            return true
        }
        dbContext.Accounts.Remove(account)
        dbContext.SaveChanges()
        return true
    }

    func SetAccountAlias(key IProfileKey, alias string) -> SetAccountAlias(int32(key.Id), alias)

    func SetAccountAlias(ctxt AccountAliasContext) -> SetAccountAlias(ctxt.LocalId, ctxt.Alias)

    func SaveFileNameSuffix(conversion Conversion, suffix string) {
        let SaveFileNameSuffix = func (conversion Conversion, suffix string) {
            using let logGuard = LogGuard(4, this)
            using let dbContext = BookDbContext(DbDir)
            dbContext.Conversions.Attach(conversion)
            conversion.DownloadFileName += suffix
            dbContext.SaveChanges()
        }
        // run in main thread, to channel DbContext.SaveChanges() invocations
        syncContext.Send(SaveFileNameSuffix, conversion, suffix)
    }

    func SavePersistentState(conversion Conversion, state EConversionState) {
        let SavePersistentState = func (conversion Conversion, state EConversionState) {
            using let logGuard = LogGuard(4, this)
            using let dbContext = BookDbContext(DbDir)
            let conv Conversion? = dbContext.Conversions.FirstOrDefault((c Conversion) -> conversion.Id == c.Id)
            if conv == nil {
                return
            }
            UpdateState(conv, state, conversion)
            dbContext.SaveChanges()
        }
        // run in main thread, to channel DbContext.SaveChanges() invocations
        syncContext.Send(SavePersistentState, conversion, state)
    }

    func RestorePersistentState(conversion Conversion) {
        using let logGuard = LogGuard(4, this)
        using let dbContext = BookDbContext(DbDir)
        let saved Conversion? = dbContext.Conversions.FirstOrDefault((c Conversion) -> c.Id == conversion.Id)
        if saved != nil {
            conversion.State = saved.State
        }
    }

    func GetPersistentState(conversion Conversion) EConversionState {
        using let logGuard = LogGuard(4, this)
        using let dbContext = BookDbContext(DbDir)
        let saved Conversion? = dbContext.Conversions.FirstOrDefault((c Conversion) -> c.Id == conversion.Id)
        return saved?.State ?? EConversionState.Unknown
    }

    func UpdateComponentProduct(componentPairs IEnumerable[ProductComponentPair]) {
        using let logGuard = LogGuard(3, this)
        lock this {
            using let dbContext = BookDbContext(DbDir)
            for (item, comp) in componentPairs {
                dbContext.Components.Attach(comp)
                comp.RunTimeLengthSeconds = item.RuntimeLengthMin * 60
                comp.Title = item.Title
            }
            dbContext.SaveChanges()
        }
    }

    func GetChapters(item IBookCommon) {
        if item.ChapterInfo?.Chapters?.Count > 0 {
            return
        }
        using let logGuard = LogGuard(3, this, () -> item.ToString())
        try {
            using let dbContext = BookDbContext(DbDir)
            if item is Book book {
                dbContext.Books.Attach(book)
                dbContext.Entry(book).Reference((b Book) -> b.ChapterInfo).Load()
                dbContext
                    .Entry(book.ChapterInfo!!)
                    .Collection((ci Oahu.BooksDatabase.ChapterInfo) -> ci.Chapters)
                    .Load()
            } else if item is Component comp {
                dbContext.Components.Attach(comp)
                dbContext.Entry(comp).Reference((c Component) -> c.ChapterInfo).Load()
                dbContext
                    .Entry(comp.ChapterInfo!!)
                    .Collection((ci Oahu.BooksDatabase.ChapterInfo) -> ci.Chapters)
                    .Load()
            }
            GetChapters(dbContext, item.ChapterInfo!!.Chapters!!)
            SortChapters(item.ChapterInfo!!.Chapters!!)
        } catch (exc Exception) {
            Log(1, this, () -> ("$item, throwing${Environment.NewLine}" + "${exc.Summary()})"))
            rethrow
        }
    }

    func GetChaptersFlattened(item IBookCommon, accuChapters List[List[ChapterExtract]]) IEnumerable[
        Oahu.BooksDatabase.Chapter
    ] {
        GetChapters(item)
        let flattened = List[Oahu.BooksDatabase.Chapter]()
        GetChaptersFlattened(item.ChapterInfo?.Chapters, flattened, accuChapters, -1)
        return flattened
    }

    func UpdateLicenseAndChapters(
        license ContentLicense?,
        conversion Conversion,
        downloadQuality EDownloadQuality
    ) AudioQuality? {
        using let logGuard = LogGuard(3, this, () -> conversion.ToString())
        try {
            using let dbContext = BookDbContext(DbDir)
            dbContext.Conversions.Attach(conversion)
            conversion.DownloadUrl = license!!.ContentMetadata!!.ContentUrl.OfflineUrl
            let product = conversion.BookCommon!!
            if product is Component comp {
                dbContext.Components.Attach(comp)
            } else if product is Book book {
                dbContext.Books.Attach(book)
            }
            let voucher Voucher? = license!!.Voucher
            // Key and IV
            product.LicenseKey = (voucher?.Key)!!
            product.LicenseIv = (voucher?.Iv)!!
            let aq AudioQuality? = SetDownloadFilenameAndCodec(license, conversion, downloadQuality)
            // file size
            product.FileSizeBytes = license!!.ContentMetadata?.ContentReference?.ContentSizeInBytes
            // duration
            let runtime = license!!.ContentMetadata?.ChapterInfo?.RuntimeLengthSec
            if (runtime != nil) {
                product.RunTimeLengthSeconds = runtime
            }
            // chapters
            AddChapters(dbContext, license, conversion)
            UpdateState(conversion, EConversionState.LicenseGranted)
            dbContext.SaveChanges()
            return aq
        } catch (exc Exception) {
            Log(1, this, () -> ("$conversion, throwing${Environment.NewLine}" + "${exc.Summary()})"))
            rethrow
        }
    }

    func CheckUpdateFilesAndState(
        profileId ProfileId,
        downloadSettings IDownloadSettings,
        exportSettings IExportSettings?,
        callbackRefConversion(IConversion) -> void,
        interactCallback IInteractionCallback[InteractionMessage[BookLibInteract], bool?]?
    ) {
        using let lg = LogGuard(3, this)
        using let dbContext = BookDbContextLazyLoad(DbDir)
        let collectedCallbacks = List[IConversion]()
        let Callback = func (conv IConversion) {
            collectedCallbacks.Add(conv)
        }
        var conversions = dbContext.Conversions.ToList()
        conversions = conversions.Where(
            (c Conversion) -> c.AccountId == profileId.AccountId && c.Region == profileId.Region
        )
            .ToList()
        let dnlddir = downloadSettings.DownloadDirectory
        for conv in conversions {
            switch conv.State {
                case EConversionState.LocalLocked {
                    CheckLocalLocked(conv, Callback, dnlddir)
                }
                case EConversionState.LocalUnlocked {
                    CheckLocalUnlocked(conv, Callback, dnlddir)
                }
                case EConversionState.Exported {
                    CheckExported(conv, Callback, dnlddir, exportSettings?.ExportDirectory)
                }
                case EConversionState.Converted {
                    CheckConverted(conv, Callback, dnlddir)
                }
                default {
                    false
                }
            }
            CheckRemoved(conv, Callback)
        }
        if collectedCallbacks.Any() {
            if !checkUpdateAnswered && interactCallback != nil {
                checkUpdateAnswer = interactCallback.Interact(
                    InteractionMessage[BookLibInteract](
                        ECallbackType.Question3,
                        nil,
                        BookLibInteract(EBookLibInteract.CheckFile)
                    )
                )
                checkUpdateAnswered = true
            }
            Log(3, this, () -> "Interact response=$checkUpdateAnswer")
            if !(checkUpdateAnswer != nil) {
                return
            }
            collectedCallbacks.ForEach((c IConversion) -> callbackRefConversion(c))
            if (checkUpdateAnswer != nil) && checkUpdateAnswer!! {
                dbContext.SaveChanges()
            }
        }
    }

    /// Verifies that books in terminal download states (LocalUnlocked, Exported, Converted)
    /// still have their output files on disk. If a file is missing, the conversion state is
    /// reset to Remote so the book can be re-downloaded.
    /// Loads the full Book graph (same shape as (cref:GetBooks)) and populates the
    /// (cref:BookCache) so the caller always sees consistent state.
    /// @returns The number of conversions that were reset.
    func VerifyCompletedDownloads(
        profileId ProfileId,
        downloadSettings IDownloadSettings?,
        exportSettings IExportSettings?
    ) int32 {
        using let lg = LogGuard(3, this)
        using let dbContext = BookDbContext(DbDir)
        // Load books with full graph, matching the GetBooks() query shape,
        // so the cached objects and DB stay in sync.
        let books IEnumerable[Book] = dbContext.Books
            .Include((b Book) -> b.Conversion)
            .Include((b Book) -> b.Components)
            .ThenInclude((c Component) -> c.Conversion)
            .Include((b Book) -> b.Authors)
            .Include((b Book) -> b.Narrators)
            .Include((b Book) -> b.Series)
            .ThenInclude((s SeriesBook) -> s.Series)
            .Include((b Book) -> b.Ladders)
            .ThenInclude((l Oahu.BooksDatabase.Ladder) -> l.Rungs)
            .ThenInclude((r Rung) -> r.Genre)
            .Include((b Book) -> b.Genres)
            .Include((b Book) -> b.Codecs)
            .ToList()
        let booksByProfile = books.Where(
            (b Book) -> b.Conversion!!.AccountId == profileId.AccountId && b.Conversion!!.Region == profileId.Region
        )
            .ToList()
        // Collect all conversions (book-level and component-level) in terminal states
        let candidateConversions = List[Conversion]()
        for book in booksByProfile {
            if (
                book
                    .Conversion
                    ?.State is EConversionState.LocalUnlocked or
                    EConversionState.Exported or
                    EConversionState.Converted
            ) {
                candidateConversions.Add(book.Conversion!!)
            }
            if book.Components != nil {
                for comp in book.Components!! {
                    if (
                        comp
                            .Conversion
                            ?.State is EConversionState.LocalUnlocked or
                            EConversionState.Exported or
                            EConversionState.Converted
                    ) {
                        candidateConversions.Add(comp.Conversion!!)
                    }
                }
            }
        }
        let dnldDir string? = downloadSettings?.DownloadDirectory
        let exportDir string? = exportSettings?.ExportDirectory
        var resetCount = 0
        for conv in candidateConversions {
            let fileExists = switch conv.State {
                case EConversionState.LocalUnlocked: OutputFileExists(conv, R.DecryptedFileExt, dnldDir)
                case EConversionState.Exported: OutputFileExists(conv, R.ExportedFileExt, exportDir)
                case EConversionState.Converted: ConvertedFilesExist(conv)
                default: true
            }
            if !fileExists {
                Log(
                    3,
                    this,
                    () -> "output file missing for \"${conv.DownloadFileName}\" (state=${conv.State}), resetting to Remote"
                )
                UpdateState(conv, EConversionState.Remote)
                conv.DownloadFileName = nil
                resetCount++
            }
        }
        if resetCount > 0 {
            dbContext.SaveChanges()
            Log(3, this, () -> "reset $resetCount conversion(s) to Remote")
        }
        // Populate the book cache with the objects we just loaded and verified.
        // GetBooks() will return these exact instances, avoiding stale reads.
        lock BookCache {
            BookCache[profileId] = booksByProfile
        }
        Log(3, this, () -> "cached ${booksByProfile.Count} book(s)")
        return resetCount
    }

    private func SetAccountAlias(id int32, alias string?) {
        using let logGuard = LogGuard(3, this, () -> "id = $id, alias = \"$alias\"")
        if alias.IsNullOrWhiteSpace() {
            return
        }
        using let dbContext = BookDbContextLazyLoad(DbDir)
        let account Account? = dbContext.Accounts.FirstOrDefault((a Account) -> a.Id == id)
        if account == nil {
            return
        }
        account.Alias = alias!!
        dbContext.SaveChanges()
    }

    private func CheckRemoved(conv Conversion, callback(IConversion?) -> void) {
        let book Book? = conv.Book
        if book?.Deleted == nil {
            return
        }
        let removed = book!!.Deleted!!
        if removed {
            if conv.State > EConversionState.Unknown && conv.State < EConversionState.LocalLocked {
                UpdateState(conv, EConversionState.Unknown)
                callback(conv)
                Log(3, this, () -> "removed: $conv")
            }
            for comp in book!!.Components!! {
                let cconv Conversion? = comp.Conversion
                if cconv!!.State > EConversionState.Unknown && cconv!!.State < EConversionState.LocalLocked {
                    UpdateState(cconv, EConversionState.Unknown)
                    callback(cconv!!)
                    Log(3, this, () -> "removed: $cconv")
                }
            }
        } else {
            if conv.State == EConversionState.Unknown {
                UpdateState(conv, EConversionState.Remote)
                callback(conv)
                Log(3, this, () -> "re-added: $conv")
            }
            for comp in book!!.Components!! {
                let cconv Conversion? = comp.Conversion
                if cconv!!.State == EConversionState.Unknown {
                    UpdateState(cconv, EConversionState.Remote)
                    callback(cconv!!)
                    Log(3, this, () -> "re-added: $cconv")
                }
            }
        }
    }

    private func CheckLocalLocked(
        conv Conversion,
        callback((IConversion) -> void)?,
        downloadDirectory string
    ) bool -> CheckFile(
        conv,
        R.EncryptedFileExt,
        callback,
        downloadDirectory,
        EConversionState.Remote,
        ECheckFile.DeleteIfMissing | ECheckFile.Relocatable
    )

    private func CheckLocalUnlocked(conv Conversion, callback((IConversion) -> void)?, downloadDirectory string) bool {
        return CheckLocal(conv, callback, downloadDirectory)
    }

    private func CheckLocal(
        conv Conversion,
        callback((IConversion) -> void)?,
        downloadDirectory string,
        transientfallback EConversionState? = nil
    ) bool {
        var succ = CheckFile(
            conv,
            R.DecryptedFileExt,
            callback,
            downloadDirectory,
            EConversionState.LocalLocked,
            ECheckFile.Relocatable,
            transientfallback
        )
        if !succ {
            succ = CheckFile(
                conv,
                R.EncryptedFileExt,
                callback,
                downloadDirectory,
                EConversionState.Remote,
                ECheckFile.DeleteIfMissing | ECheckFile.Relocatable,
                transientfallback
            )
        }
        return succ
    }

    private func CheckExported(
        conv Conversion,
        callback((IConversion) -> void)?,
        downloadDirectory string,
        exportDirectory string?
    ) bool {
        var succ = CheckFile(
            conv,
            R.ExportedFileExt,
            callback,
            exportDirectory,
            EConversionState.LocalUnlocked,
            ECheckFile.None,
            EConversionState.ConvertedUnknown
        )
        if !succ {
            succ = CheckLocal(conv, callback, downloadDirectory, EConversionState.ConvertedUnknown)
        }
        return succ
    }

    private func CheckConverted(conv Conversion, callback((IConversion) -> void)?, downloadDirectory string) bool {
        var succ = CheckConvertedFiles(conv, callback)
        if !succ {
            succ = CheckLocal(conv, callback, downloadDirectory, EConversionState.ConvertedUnknown)
        }
        return succ
    }

    private func CheckConvertedFiles(conv Conversion, callback((IConversion) -> void)?) bool {
        let dir = conv.DestDirectory.AsUncIfLong()
        var exists = false
        if Directory.Exists(dir) {
            let files = Directory.GetFiles(dir)
            exists = files
                .Select((f string) -> Path.GetExtension(f).ToLower())
                .Where((e string) -> BookLibrary.Extensions.Contains(e))
                .Any()
        }
        if exists {
            return true
        } else {
            Log(3, this, () -> "not found: \"${conv.DownloadFileName.GetDownloadFileNameWithoutExtension()}\"")
            conv.State = EConversionState.ConvertedUnknown
            callback?(conv)
            return false
        }
    }

    private func CheckFile(
        conv Conversion,
        ext string?,
        callback((IConversion) -> void)?,
        downloadDirectory string?,
        fallback EConversionState,
        flags ECheckFile,
        transientfallback EConversionState? = nil
    ) bool {
        if flags.HasFlag(ECheckFile.Relocatable) {
            if downloadDirectory == nil {
                return false
            }
            var path = (conv.DownloadFileName + ext).AsUncIfLong()
            if File.Exists(path) {
                return true
            }
            if conv.DownloadFileName != nil {
                let filename string? = conv.DownloadFileName.GetDownloadFileNameWithoutExtension()
                let pathStub = Path.Combine(downloadDirectory, filename!!)
                path = (pathStub + ext).AsUncIfLong()
                if File.Exists(path) {
                    conv.DownloadFileName = pathStub
                    return true
                }
            }
        } else {
            let filename string? = conv.DownloadFileName.GetDownloadFileNameWithoutExtension()
            let pathStub = Path.Combine(downloadDirectory!!, filename!!)
            let path = (pathStub + ext).AsUncIfLong()
            if File.Exists(path) {
                return true
            }
        }
        Log(3, this, () -> "not found \"$ext\": \"${conv.DownloadFileName.GetDownloadFileNameWithoutExtension()}\"")
        if flags.HasFlag(ECheckFile.DeleteIfMissing) {
            conv.DownloadFileName = nil
        }
        if (transientfallback != nil) {
            let tmp Conversion? = conv.Copy()
            tmp!!.State = transientfallback
            callback?(tmp!!)
        }
        UpdateState(conv, fallback)
        if !(transientfallback != nil) {
            callback?(conv)
        }
        return false
    }

    private func AddRemBooks(libProducts List[Product], profileId ProfileId, resync bool) {
        lock BookCache {
            BookCache.Remove(profileId)
        }
        using let dbContext = BookDbContextLazyLoad(DbDir)
        let bcl = BookCompositeLists(
            dbContext.Books.Select((b Book) -> b.Asin).ToList(),
            dbContext.Accounts.Select((a Account) -> a.Id).ToList(),
            dbContext.Conversions.ToList(),
            dbContext.Components.ToList(),
            dbContext.Series.ToList(),
            dbContext.SeriesBooks.ToList(),
            dbContext.Authors.ToList(),
            dbContext.Narrators.ToList(),
            dbContext.Genres.ToList(),
            dbContext.Ladders.ToList(),
            dbContext.Rungs.ToList(),
            dbContext.Codecs.ToList()
        )
        var page = 0
        var remaining = libProducts.Count
        while remaining > 0 {
            let count = Math.Min(remaining, PageSize)
            let start = page * PageSize
            page++
            remaining -= count
            let subrange = libProducts.GetRange(start, count)
            AddPageBooks(dbContext, bcl, subrange, profileId, resync)
        }
        if resync {
            RemoveBooks(dbContext, bcl, libProducts, profileId)
        }
    }

    private func SinceLatestPurchaseDate(profileId ProfileId, resync bool) DateTime {
        var dt = DateTime(1970, 1, 1)
        if resync {
            return dt
        }
        using let dbContext = BookDbContextLazyLoad(DbDir)
        let latest = dbContext.Books
            .Where(
            (b Book) -> (b.PurchaseDate != nil) &&
                b
                .Conversion
                .AccountId == profileId.AccountId &&
                b
                .Conversion
                .Region == profileId.Region
        )
            .Select((b Book) -> b.PurchaseDate.Value)
            .OrderBy((b DateTime) -> b)
            .LastOrDefault()
        if latest != default(DateTime) {
            dt = latest + TimeSpan.FromMilliseconds(1)
        }
        return dt
    }

    private func CleanupDuplicateAuthors() {
        using let dbContext = BookDbContextLazyLoad(DbDir)
        let authors = dbContext.Authors
        let duplicates = authors
            .ToList()
            .GroupBy((x Oahu.BooksDatabase.Author) -> x.Name!!)
            .Where((g IGrouping[string, Oahu.BooksDatabase.Author]) -> g.Count() > 1)
            .ToList()
        const PseudoKeyLength = 7
        for d in duplicates {
            let asinAuthor Oahu.BooksDatabase.Author? = d.FirstOrDefault(
                (d Oahu.BooksDatabase.Author) -> d.Asin!!.Length > PseudoKeyLength
            )
            if asinAuthor == nil {
                continue
            }
            for author in d {
                if author == asinAuthor {
                    continue
                }
                for book in author.Books!! {
                    book.Authors!!.Remove(author)
                    book.Authors!!.Add(asinAuthor)
                }
                authors.Remove(author)
            }
        }
        dbContext.SaveChanges()
    }

    private func AddPageBooks(
        dbContext BookDbContextLazyLoad,
        bcl BookCompositeLists,
        products IEnumerable[Product],
        profileId ProfileId,
        resync bool
    ) {
        try {
            using let logGuard = LogGuard(3, this, () -> "#items=${products.Count()}")
            for product in products {
                try {
                    if Readd(bcl, product, profileId, resync) {
                        continue
                    }
                    let book = AddBook(dbContext, product)
                    AddComponents(book, bcl.Components, product.Relationships)
                    AddConversions(book, bcl.Conversions, profileId)
                    AddSeries(book, bcl.Series, bcl.SeriesBooks, product.Relationships)
                    AddPersons(dbContext, book, bcl.Authors, product.Authors, (b Book) -> b.Authors!!)
                    AddPersons(dbContext, book, bcl.Narrators, product.Narrators, (b Book) -> b.Narrators!!)
                    AddGenres(book, bcl.Genres, bcl.Ladders, bcl.Rungs, product.CategoryLadders)
                    AddCodecs(book, bcl.Codecs, product.AvailableCodecs)
                    Log(3, this, () -> "added: $book")
                } catch (exc Exception) {
                    Log(
                        1,
                        this,
                        () -> (
                            "asin=${product.Asin}, \"${product.Title}\", throwing${Environment.NewLine}" +
                                "${exc.Summary()})"
                        )
                    )
                    rethrow
                }
            }
            dbContext.SaveChanges()
        } catch (exc DbUpdateException) {
            Log(1, this, () -> exc.ToString())
            rethrow
        } catch (exc Exception) {
            Log(1, this, () -> exc.Summary())
            rethrow
        }
    }

    private func Readd(bcl BookCompositeLists, product Product, profileId ProfileId, resync bool) bool {
        if bcl.BookAsins.Contains(product.Asin) {
            let bk Book? = bcl
                .Conversions
                .FirstOrDefault((conv Conversion) -> string.Equals(conv.Book?.Asin, product.Asin))
                ?.Book
            AdoptOrphanedBook(bcl, bk, profileId)
            if !resync {
                return true
            }
            if !(bk?.Deleted ?? false) {
                return true
            }
            bk!!.Deleted = false
            bk!!.Conversion!!.AccountId = profileId.AccountId
            bk!!.Conversion!!.Region = profileId.Region
            if bk!!.Conversion!!.State < EConversionState.LocalLocked {
                UpdateState(bk!!.Conversion, EConversionState.Remote)
            }
            for comp in bk!!.Components!! {
                if comp.Conversion!!.State < EConversionState.LocalLocked {
                    UpdateState(comp.Conversion, EConversionState.Remote)
                }
                comp.Conversion!!.AccountId = profileId.AccountId
                comp.Conversion!!.Region = profileId.Region
            }
            Log(3, this, () -> "readded: $bk")
            return true
        } else {
            return false
        }
    }

    /// Re-binds a locally known book to the profile currently syncing, but only when the account
    /// it is bound to no longer exists.
    /// @remarks Books and conversions reference (cref:Account) rows by id without a foreign key.
    /// Removing a profile drops the account row and leaves its conversions pointing at an id that
    /// is gone; registering the same Audible account again allocates a new id, so the whole local
    /// library becomes invisible. The product being processed here was returned by the current
    /// profile's library, so adopting orphaned content is safe. Content owned by another account
    /// that is still registered is left untouched.
    private func AdoptOrphanedBook(bcl BookCompositeLists, book Book?, profileId ProfileId) {
        let conversion Conversion? = book?.Conversion
        if conversion == nil {
            return
        }
        if conversion.AccountId == profileId.AccountId && conversion.Region == profileId.Region {
            return
        }
        if bcl.KnownAccountIds.Contains(conversion.AccountId) {
            return
        }
        Log(3, this, () -> "adopted from orphaned account ${conversion.AccountId}: $book")
        conversion.AccountId = profileId.AccountId
        conversion.Region = profileId.Region
        for comp in book!!.Components!! {
            if comp.Conversion == nil {
                continue
            }
            comp.Conversion!!.AccountId = profileId.AccountId
            comp.Conversion!!.Region = profileId.Region
        }
    }

    private func RemoveBooks(
        dbContext BookDbContextLazyLoad,
        bcl BookCompositeLists,
        products IEnumerable[Product],
        profileId ProfileId
    ) {
        try {
            using let logGuard = LogGuard(3, this, () -> "#items=${products.Count()}")
            let currentAsins = products.Select((p Product) -> p.Asin).ToList()
            let removeAsins = bcl.BookAsins.Except(currentAsins).ToList()
            if !removeAsins.Any() {
                return
            }
            Log(3, this, () -> "# to be removed=${removeAsins.Count} (not yet filtered by profile)")
            var nRemoved = 0
            for asin in removeAsins {
                let book Book? = bcl
                    .Conversions
                    .FirstOrDefault((conv Conversion) -> string.Equals(conv.Book?.Asin, asin))
                    ?.Book
                if book == nil {
                    continue
                }
                if book.Conversion!!.AccountId != profileId.AccountId ||
                    book.Conversion!!.Region != profileId.Region {
                    Log(3, this, () -> "different profile, ignored: $asin")
                    continue
                }
                book.Deleted = true
                if book.Conversion!!.State < EConversionState.LocalLocked {
                    UpdateState(book.Conversion, EConversionState.Unknown)
                }
                for comp in book.Components!! {
                    if comp.Conversion!!.State < EConversionState.LocalLocked {
                        UpdateState(comp.Conversion, EConversionState.Unknown)
                    }
                }
                Log(3, this, () -> "marked as removed: $book")
                nRemoved++
            }
            dbContext.SaveChanges()
            Log(3, this, () -> "# actually marked as removed=$nRemoved")
        } catch (exc Exception) {
            Log(1, this, () -> exc.Summary())
            rethrow
        }
    }

    private func GetChaptersFlattened(
        source IEnumerable[Oahu.BooksDatabase.Chapter]?,
        dest List[Oahu.BooksDatabase.Chapter],
        accuChapters List[List[ChapterExtract]]?,
        level int32
    ) {
        var level = level
        if source.IsNullOrEmpty() {
            return
        }
        using let rg = ResourceGuard(
            (x bool) -> {
                if x {
                    level++
                } else {
                    level--
                }
            }
        )
        if accuChapters?.Count < level + 1 {
            accuChapters?.Add(List[ChapterExtract]())
        }
        let accu List[ChapterExtract]? = accuChapters?[level]
        for ch in source!! {
            dest.Add(Oahu.BooksDatabase.Chapter(ch))
            accu?.Add(ChapterExtract(ch.Title!!, ch.LengthMs))
            GetChaptersFlattened(ch.Chapters, dest, accuChapters, level)
        }
    }

    private func GetChapters(dbContext BookDbContext, chapters ICollection[Oahu.BooksDatabase.Chapter]) {
        if chapters.IsNullOrEmpty() {
            return
        }
        for ch in chapters {
            dbContext.Entry(ch).Collection((ci Oahu.BooksDatabase.Chapter) -> ci.Chapters).Load()
            GetChapters(dbContext, ch.Chapters!!)
        }
    }

    private func SortChapters(chapters ICollection[Oahu.BooksDatabase.Chapter]) {
        if chapters.IsNullOrEmpty() {
            return
        }
        if chapters is List[Oahu.BooksDatabase.Chapter]list {
            list.Sort(
                (x Oahu.BooksDatabase.Chapter, y Oahu.BooksDatabase.Chapter) -> x.StartOffsetMs.CompareTo(
                    y.StartOffsetMs
                )
            )
        }
        chapters.ForEach((ch Oahu.BooksDatabase.Chapter) -> SortChapters(ch.Chapters!!))
    }

    shared {
        private const PageSize int32 = 200
        private const RegexSeriesPattern string = "(\\d+)(\\.(\\d+))?"
        private let Extensions IEnumerable[string] = []string{".m3u", ".mp3", ".m4a", ".m4b"}
        private let RegexSeries Regex = Regex(RegexSeriesPattern, RegexOptions.Compiled)
        private var checkUpdateAnswered bool
        private var checkUpdateAnswer bool?

        private func OutputFileExists(conv Conversion, ext string?, directory string?) bool {
            if conv.DownloadFileName != nil {
                // Check using the stored full path
                let path = (conv.DownloadFileName + ext).AsUncIfLong()
                if File.Exists(path) {
                    return true
                }
            }
            // Check in the configured directory (file may have been relocated)
            if conv.DownloadFileName != nil && directory != nil {
                let filename string? = conv.DownloadFileName.GetDownloadFileNameWithoutExtension()
                let path = Path.Combine(directory, filename + ext).AsUncIfLong()
                if File.Exists(path) {
                    return true
                }
            }
            return false
        }

        private func ConvertedFilesExist(conv Conversion) bool {
            let dir string? = conv.DestDirectory?.AsUncIfLong()
            if dir == nil || !Directory.Exists(dir) {
                return false
            }
            return Directory
                .GetFiles(dir)
                .Select((f string) -> Path.GetExtension(f).ToLower())
                .Any((e string) -> BookLibrary.Extensions.Contains(e))
        }

        private func AddChapters(dbContext BookDbContext, license ContentLicense?, conversion Conversion) {
            let source Oahu.Audible.Json.ChapterInfo? = license?.ContentMetadata?.ChapterInfo
            if source == nil {
                return
            }
            let product = conversion.BookCommon!!
            let chapterInfo = Oahu.BooksDatabase.ChapterInfo()
            dbContext.ChapterInfos.Add(chapterInfo)
            if product is Book book {
                dbContext.Entry(book).Reference((b Book) -> b.ChapterInfo).Load()
                if book.ChapterInfo != nil {
                    dbContext.Remove(book.ChapterInfo!!)
                }
                book.ChapterInfo = chapterInfo
            } else if product is Component comp {
                dbContext.Entry(comp).Reference((b Component) -> b.ChapterInfo).Load()
                if comp.ChapterInfo != nil {
                    dbContext.Remove(comp.ChapterInfo!!)
                }
                comp.ChapterInfo = chapterInfo
            }
            chapterInfo.BrandIntroDurationMs = source.BrandIntroDurationMs ?? 0
            chapterInfo.BrandOutroDurationMs = source.BrandOutroDurationMs ?? 0
            chapterInfo.IsAccurate = source.IsAccurate
            chapterInfo.RuntimeLengthMs = source.RuntimeLengthMs ?? 0
            if source.Chapters.IsNullOrEmpty() {
                return
            }
            for ch in source.Chapters {
                let chapter = Oahu.BooksDatabase.Chapter()
                dbContext.Chapters.Add(chapter)
                chapterInfo.Chapters!!.Add(chapter)
                SetChapter(ch, chapter)
                if !ch.Chapters.IsNullOrEmpty() {
                    AddChapters(dbContext, ch, chapter)
                }
            }
        }

        private func UpdateState(conversion Conversion?, state EConversionState, original Conversion? = nil) {
            conversion!!.State = state
            conversion!!.LastUpdate = DateTime.UtcNow
            if original != nil {
                original.State = conversion!!.State
                original.LastUpdate = conversion!!.LastUpdate
                original.PersistState = conversion!!.State
            }
        }

        private func SetDownloadFilenameAndCodec(
            license ContentLicense?,
            conversion Conversion,
            downloadQuality EDownloadQuality
        ) AudioQuality? {
            let product = conversion.BookCommon!!
            product.DownloadQuality = downloadQuality
            // download destination
            let dir string? = conversion.DownloadFileName
            let sb = StringBuilder()
            // title plus asin plus codec.aaxc.m4b
            var title = product.Title.Prune()!!
            title = title.Substring(0, Math.Min(20, title.Length))
            sb.Append(title)
            let asin = product.Asin!!
            sb.Append("_${asin}_LC")
            var aq AudioQuality? = nil
            let format string? = license!!.ContentMetadata?.ContentReference?.ContentFormat?.ToLower()
            let succ = ExCodec.TryParseCodec(format, out var codec)
            if succ {
                product.FileCodec = codec
                aq = codec.ToQuality()
                if aq != nil {
                    product.BitRate = aq.BitRate
                    product.SampleRate = aq.SampleRate
                    if (aq.BitRate != nil) {
                        sb.Append("_${aq.BitRate!!}")
                    }
                    if (aq.SampleRate != nil) {
                        sb.Append("_${aq.SampleRate!!}")
                    }
                }
            }
            let filename = sb.ToString() // + ".aaxc.m4b";
            let path = Path.Combine(dir!!, filename)
            conversion.DownloadFileName = path
            return aq
        }

        private func SetChapter(src Oahu.Audible.Json.Chapter, chapter Oahu.BooksDatabase.Chapter) {
            chapter.LengthMs = src.LengthMs ?? 0
            chapter.StartOffsetMs = src.StartOffsetMs ?? 0
            chapter.Title = src.Title
        }

        private func AddChapters(
            dbContext BookDbContext,
            source Oahu.Audible.Json.Chapter?,
            parent Oahu.BooksDatabase.Chapter
        ) {
            for ch in source!!.Chapters {
                let chapter = Oahu.BooksDatabase.Chapter()
                dbContext.Chapters.Add(chapter)
                parent.Chapters!!.Add(chapter)
                SetChapter(ch, chapter)
                if !ch.Chapters.IsNullOrEmpty() {
                    AddChapters(dbContext, ch, chapter)
                }
            }
        }

        private func AddBook(dbContext BookDbContextLazyLoad, product Product) Book {
            let book = Book{
                Asin: product.Asin,
                Title: product.Title,
                Subtitle: product.Subtitle,
                PublisherName: product.PublisherName,
                PublisherSummary: product.PublisherSummary,
                MerchandisingSummary: product.MerchandisingSummary,
                AverageRating: product.Rating?.OverallDistribution?.AverageRating,
                RunTimeLengthSeconds: if (product.RuntimeLengthMin != nil) {
                    product.RuntimeLengthMin!!* 60
                } else {
                    nil
                },
                AdultProduct: product.IsAdultProduct,
                PurchaseDate: product.PurchaseDate,
                ReleaseDate: product.ReleaseDate ?? product.IssueDate,
                Language: product.Language,
                CoverImageUrl: product.ProductImages?.Image500!!,
                Sku: product.Sku,
                SkuLite: product.SkuLite
            }
            let succ = Enum.TryParse[EDeliveryType](product.ContentDeliveryType, out var deltype)
            if succ {
                book.DeliveryType = deltype
            }
            if !product.FormatType.IsNullOrEmpty() {
                book.Unabridged = product.FormatType == "unabridged"
            }
            dbContext.Books.Add(book)
            return book
        }

        private func AddComponents(
            book Book,
            components ICollection[Component],
            itmRelations IEnumerable[Relationship]?
        ) {
            let relations List[Relationship]? = itmRelations?.Where(
                (r Relationship) -> r.RelationshipToProduct == "child" && r.RelationshipType == "component"
            )
                .ToList()
            if relations.IsNullOrEmpty() {
                return
            }
            for rel in relations!! {
                int32.TryParse(rel.Sort, out var partNum)
                let component = Component{
                    Asin: rel.Asin,
                    Title: rel.Title,
                    Sku: rel.Sku,
                    SkuLite: rel.SkuLite,
                    PartNumber: partNum
                }
                components.Add(component)
                book.Components!!.Add(component)
            }
        }

        private func AddSeries(
            book Book,
            series ICollection[Oahu.BooksDatabase.Series],
            seriesBooks ICollection[SeriesBook],
            itmRelations IEnumerable[Relationship]?
        ) {
            if itmRelations == nil {
                return
            }
            let itmSeries = itmRelations.Where(
                (r Relationship) -> r.RelationshipToProduct == "parent" && r.RelationshipType == "series"
            )
                .ToList()
            for itmSerie in itmSeries {
                var serie Oahu.BooksDatabase.Series? = series.FirstOrDefault(
                    (s Oahu.BooksDatabase.Series) -> s.Asin == itmSerie.Asin
                )
                if serie == nil {
                    serie = Oahu
                        .BooksDatabase
                        .Series{
                        Asin: itmSerie.Asin,
                        Title: itmSerie.Title,
                        Sku: itmSerie.Sku,
                        SkuLite: itmSerie.SkuLite
                    }
                    series.Add(serie)
                }
                let seriesBook = SeriesBook{Book: book, Series: serie, Sequence: itmSerie.Sequence}
                var succ = int32.TryParse(itmSerie.Sort, out var sort)
                if succ {
                    seriesBook.Sort = sort
                }
                let match = RegexSeries.Match(itmSerie.Sequence)
                if match.Success {
                    let n = match.Groups.Count
                    if n >= 2 {
                        let major = match.Groups[1].Value
                        succ = int32.TryParse(major, out var num)
                        if succ {
                            seriesBook.BookNumber = num
                            if n >= 3 {
                                let minor = match.Groups[3].Value
                                succ = int32.TryParse(minor, out var subnum)
                                if succ {
                                    seriesBook.SubNumber = int32.Parse(minor)
                                }
                            }
                        }
                    }
                }
                seriesBooks.Add(seriesBook)
                book.Series!!.Add(seriesBook)
            }
        }

        private func AddPersons[TPerson Oahu.BooksDatabase.IPerson class init()](
            dbContext BookDbContextLazyLoad,
            book Book,
            persons ICollection[TPerson],
            itmPersons IEnumerable[Oahu.Audible.Json.IPerson]?,
            getBookPersons(Book) -> ICollection[TPerson]
        ) {
            if itmPersons == nil {
                return
            }
            for itmPerson in itmPersons {
                var person TPerson? = nil
                if itmPerson.Asin == nil {
                    person = persons.FirstOrDefault((a TPerson) -> a.Name == itmPerson.Name)
                    if person == nil {
                        itmPerson.Asin = dbContext.GetNextPseudoAsin(typeof(TPerson))
                    }
                }
                if person == nil {
                    person = persons.FirstOrDefault((a TPerson) -> a.Asin == itmPerson.Asin)
                }
                if person == nil {
                    person = TPerson{Asin: itmPerson.Asin!!, Name: itmPerson.Name}
                    persons.Add(person)
                }
                person.Books!!.Add(book)
                getBookPersons(book).Add(person)
            }
        }

        private func AddGenres(
            book Book,
            genres ICollection[Genre],
            ladders ICollection[Oahu.BooksDatabase.Ladder],
            rungs ICollection[Rung],
            itmCategories IEnumerable[Category]?
        ) {
            // local function
            let Equals = func (oldLadder Oahu.BooksDatabase.Ladder, newLadder Oahu.BooksDatabase.Ladder?) bool {
                if newLadder!!.Rungs!!.Count != oldLadder.Rungs!!.Count {
                    return false
                }
                let rungs = oldLadder.Rungs!!.OrderBy((r Rung) -> r.OrderIdx)
                let iter1 = newLadder!!.Rungs!!.GetEnumerator()
                let iter2 = rungs.GetEnumerator()
                while iter1.MoveNext() {
                    iter2.MoveNext()
                    let r1 = iter1.Current
                    let r2 = iter2.Current
                    if r1.Genre != r2.Genre {
                        return false
                    }
                }
                return true
            }
            if itmCategories == nil {
                return
            }
            let categories = itmCategories.Where((c Category) -> c.Root == "Genres").ToList()
            for category in categories {
                var ladder Oahu.BooksDatabase.Ladder? = Oahu.BooksDatabase.Ladder()
                for var i = 0;
                i < category.Ladder.Length;
                i++ {
                    let itmLadder = category.Ladder[i]
                    let idx = i + 1
                    let succ = int64.TryParse(itmLadder.Id, out var id)
                    if !succ {
                        continue
                    }
                    var genre Genre? = genres.FirstOrDefault((g Genre) -> g.ExternalId == id)
                    if genre == nil {
                        genre = Genre{ExternalId: id, Name: itmLadder.Name}
                        genres.Add(genre)
                    }
                    book.Genres!!.Add(genre)
                    var rung Rung? = rungs.FirstOrDefault((r Rung) -> r.OrderIdx == idx && r.Genre == genre)
                    if rung == nil {
                        rung = Rung{OrderIdx: idx, Genre: genre}
                        rungs.Add(rung)
                    }
                    ladder!!.Rungs!!.Add(rung)
                }
                let existingLadder Oahu.BooksDatabase.Ladder? = ladders.FirstOrDefault(
                    (l Oahu.BooksDatabase.Ladder) -> Equals(l, ladder)
                )
                if existingLadder == nil {
                    ladders.Add(ladder!!)
                } else {
                    ladder = existingLadder
                }
                book.Ladders!!.Add(ladder!!)
            }
        }

        private func AddCodecs(
            book Book,
            codecList ICollection[Oahu.BooksDatabase.Codec],
            itmCodecs IEnumerable[Oahu.Audible.Json.Codec]?
        ) {
            if itmCodecs == nil {
                return
            }
            for itmCodec in itmCodecs {
                let succ = ExCodec.TryParseCodec(itmCodec.Name, out var codecName)
                if !succ {
                    continue
                }
                var codec Oahu.BooksDatabase.Codec? = codecList.FirstOrDefault(
                    (c Oahu.BooksDatabase.Codec) -> c.Name == codecName
                )
                if codec == nil {
                    codec = Oahu.BooksDatabase.Codec{Name: codecName}
                    codecList.Add(codec)
                }
                book.Codecs!!.Add(codec)
            }
        }

        private func AddConversions(book Book, conversions ICollection[Conversion], profileId ProfileId) {
            // default
            {
                let conversion = Conversion{AccountId: profileId.AccountId, Region: profileId.Region}
                UpdateState(conversion, EConversionState.Remote)
                book.Conversion = conversion
                conversions.Add(conversion)
            }
            // components
            for component in book.Components!! {
                if component.Conversion != nil {
                    continue
                }
                let conversion = Conversion{
                    State: EConversionState.Remote,
                    AccountId: profileId.AccountId,
                    Region: profileId.Region
                }
                component.Conversion = conversion
                conversions.Add(conversion)
            }
        }
    }
}
