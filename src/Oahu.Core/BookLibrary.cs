using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Oahu.Aux;
using Oahu.Aux.Extensions;
using Oahu.BooksDatabase;
using Oahu.BooksDatabase.Ex;
using Oahu.Core.Ex;
using static Oahu.Aux.Logging;
using R = Oahu.Core.Properties.Resources;

namespace Oahu.Core
{
  class BookLibrary : IBookLibrary
  {
    public readonly string DbDir = null;
    public readonly string ImgDir = Path.Combine(ApplEnv.LocalApplDirectory, "img");

    public readonly Dictionary<ProfileId, IEnumerable<Book>> BookCache =
      new Dictionary<ProfileId, IEnumerable<Book>>();

    const int PageSize = 200;
    const string RegexSeriesPattern = @"(\d+)(\.(\d+))?";
    static readonly IEnumerable<string> Extensions = new string[] { ".m3u", ".mp3", ".m4a", ".m4b" };
    static readonly Regex RegexSeries = new Regex(RegexSeriesPattern, RegexOptions.Compiled);
    private static bool checkUpdateAnswered;
    private static bool? checkUpdateAnswer;
    private SynchronizationContext syncContext;

    public BookLibrary(string dbDir = null)
    {
      this.DbDir = dbDir;
      syncContext = SynchronizationContext.Current;
    }

    public async Task<DateTime> SinceLatestPurchaseDateAsync(ProfileId profileId, bool resync)
    {
      return await Task.Run(() => SinceLatestPurchaseDate(profileId, resync));
    }

    public async Task AddRemBooksAsync(List<Oahu.Audible.Json.Product> libProducts, ProfileId profileId, bool resync)
    {
      using var logGuard = new LogGuard(3, this, () => $"#items={libProducts.Count}, resync={resync}");
      await Task.Run(() => AddRemBooks(libProducts, profileId, resync));
      await Task.Run(() => CleanupDuplicateAuthors());
    }

    public async Task AddCoverImagesAsync(Func<string, Task<byte[]>> downloadFunc)
    {
      using var logGuard = new LogGuard(3, this);

      Directory.CreateDirectory(ImgDir);

      using var dbContext = new BookDbContextLazyLoad(DbDir);
      var files = Directory.GetFiles(ImgDir);

      var books = dbContext.Books
        .ToList()
        .Where(c => c.CoverImageFile is null || !files.Contains(c.CoverImageFile))
        .ToList();

      Log(3, this, () => $"#img={books.Count}");
      foreach (Book book in books)
      {
        Log(3, this, () => book.ToString());
        string url = book.CoverImageUrl;
        if (url is null)
        {
          continue;
        }

        byte[] img = await downloadFunc(url);
        if (img is null)
        {
          continue;
        }

        string ext = img.FindImageFormat();
        if (ext is null)
        {
          continue;
        }

        string filename = $"{book.Asin}{ext}";
        string path = Path.Combine(ImgDir, filename);
        try
        {
          await File.WriteAllBytesAsync(path, img);

          book.CoverImageFile = path;
        }
        catch (Exception)
        {
        }
      }

      dbContext.SaveChanges();
    }

    public IEnumerable<Book> GetBooks(ProfileId profileId)
    {
      using var logGuard = new LogGuard(3, this, () => profileId.ToString());

      lock (BookCache)
      {
        bool succ = BookCache.TryGetValue(profileId, out var cached);
        if (succ)
        {
          Log(3, this, () => $"from cache, #books={cached.Count()}");
          return cached;
        }
      }

      using var dbContext = new BookDbContext(DbDir);

      // using var rg = new ResourceGuard (x => dbContext.ChangeTracker.LazyLoadingEnabled = !x);
      IEnumerable<Book> books = dbContext.Books
        .Include(b => b.Conversion)
        .Include(b => b.Components)
        .ThenInclude(c => c.Conversion)
        .Include(b => b.Authors)
        .Include(b => b.Narrators)
        .Include(b => b.Series)
        .ThenInclude(s => s.Series)
        .Include(b => b.Ladders)
        .ThenInclude(l => l.Rungs)
        .ThenInclude(r => r.Genre)
        .Include(b => b.Genres)
        .Include(b => b.Codecs)
        .ToList();

      var booksByProfile = books
        .Where(b => b.Conversion.AccountId == profileId.AccountId && b.Conversion.Region == profileId.Region)
        .ToList();

      lock (BookCache)
      {
        BookCache[profileId] = booksByProfile;
      }

      Log(3, this, () => $"from DB, #books={booksByProfile.Count()}");

      return booksByProfile;
    }

    public IEnumerable<AccountAlias> GetAccountAliases()
    {
      using var logGuard = new LogGuard(3, this);
      using var dbContext = new BookDbContextLazyLoad(DbDir);
      var accounts = dbContext.Accounts.ToList();
      var contexts = accounts
        .Select(a => new AccountAlias(a.AudibleId, a.Alias))
        .ToList();
      Log(3, this, () => $"#contexts={contexts.Count}");
      return contexts;
    }

    public AccountAliasContext GetAccountId(IProfile profile, bool newAlias)
    {
      using var logGuard = new LogGuard(3, this);
      using var dbContext = new BookDbContextLazyLoad(DbDir);

      string accountId = profile.CustomerInfo.AccountId;
      var account = dbContext.Accounts.FirstOrDefault(a => a.AudibleId == accountId);
      if (account is null)
      {
        List<uint> hashes = GetAliasHashes();
        account = new Account
        {
          AudibleId = accountId
        };
        dbContext.Accounts.Add(account);
        dbContext.SaveChanges();
        return new AccountAliasContext(account.Id, profile.CustomerInfo.Name, hashes);
      }
      else
      {
        if (account.Alias.IsNullOrWhiteSpace() || newAlias)
        {
          if (newAlias)
          {
            return new AccountAliasContext(account.Id, profile.CustomerInfo.Name, GetAliasHashes())
            {
              Alias = account.Alias
            };
          }
          else
          {
            return new AccountAliasContext(account.Id, profile.CustomerInfo.Name, GetAliasHashes());
          }
        }
        else
        {
          return new AccountAliasContext(account.Id, null, null)
          {
            Alias = account.Alias
          };
        }
      }

      List<uint> GetAliasHashes()
      {
        return dbContext.Accounts
          .ToList()
          .Where(a => !a.Alias.IsNullOrWhiteSpace())
          .Select(a => a.Alias.Checksum32())
          .ToList();
      }
    }

    public bool RemoveAccountId(IProfileKey key)
    {
      using var logGuard = new LogGuard(3, this, () => $"id = {key.Id}");
      using var dbContext = new BookDbContextLazyLoad(DbDir);
      string accountId = key.AccountId;
      var account = dbContext.Accounts.FirstOrDefault(a => a.AudibleId == accountId);
      if (account == null)
      {
        return false;
      }

      dbContext.Accounts.Remove(account);
      dbContext.SaveChanges();
      return true;
    }

    public void SetAccountAlias(IProfileKey key, string alias) =>
      SetAccountAlias((int)key.Id, alias);

    public void SetAccountAlias(AccountAliasContext ctxt) =>
      SetAccountAlias(ctxt.LocalId, ctxt.Alias);

    public void SaveFileNameSuffix(Conversion conversion, string suffix)
    {
      // run in main thread, to channel DbContext.SaveChanges() invocations
      syncContext.Send(SaveFileNameSuffix, conversion, suffix);

      void SaveFileNameSuffix(Conversion conversion, string suffix)
      {
        using var logGuard = new LogGuard(4, this);
        using var dbContext = new BookDbContext(DbDir);
        dbContext.Conversions.Attach(conversion);

        conversion.DownloadFileName += suffix;
        dbContext.SaveChanges();
      }
    }

    public void SavePersistentState(Conversion conversion, EConversionState state)
    {
      // run in main thread, to channel DbContext.SaveChanges() invocations
      syncContext.Send(SavePersistentState, conversion, state);

      void SavePersistentState(Conversion conversion, EConversionState state)
      {
        using var logGuard = new LogGuard(4, this);
        using var dbContext = new BookDbContext(DbDir);
        var conv = dbContext.Conversions.FirstOrDefault(c => conversion.Id == c.Id);
        if (conv is null)
        {
          return;
        }

        UpdateState(conv, state, conversion);
        dbContext.SaveChanges();
      }
    }

    public void RestorePersistentState(Conversion conversion)
    {
      using var logGuard = new LogGuard(4, this);
      using var dbContext = new BookDbContext(DbDir);
      Conversion saved = dbContext.Conversions.FirstOrDefault(c => c.Id == conversion.Id);
      if (saved is not null)
      {
        conversion.State = saved.State;
      }
    }

    public EConversionState GetPersistentState(Conversion conversion)
    {
      using var logGuard = new LogGuard(4, this);
      using var dbContext = new BookDbContext(DbDir);
      Conversion saved = dbContext.Conversions.FirstOrDefault(c => c.Id == conversion.Id);
      return saved?.State ?? EConversionState.Unknown;
    }

    public void UpdateComponentProduct(IEnumerable<ProductComponentPair> componentPairs)
    {
      using var logGuard = new LogGuard(3, this);
      lock (this)
      {
        using var dbContext = new BookDbContext(DbDir);
        foreach (var (item, comp) in componentPairs)
        {
          dbContext.Components.Attach(comp);
          comp.RunTimeLengthSeconds = item.RuntimeLengthMin * 60;
          comp.Title = item.Title;
        }

        dbContext.SaveChanges();
      }
    }

    public void GetChapters(IBookCommon item)
    {
      if (item.ChapterInfo?.Chapters?.Count > 0)
      {
        return;
      }

      using var logGuard = new LogGuard(3, this, () => item.ToString());

      try
      {
        using var dbContext = new BookDbContext(DbDir);
        if (item is Book book)
        {
          dbContext.Books.Attach(book);
          dbContext.Entry(book).Reference(b => b.ChapterInfo).Load();
          dbContext.Entry(book.ChapterInfo).Collection(ci => ci.Chapters).Load();
        }
        else if (item is Component comp)
        {
          dbContext.Components.Attach(comp);
          dbContext.Entry(comp).Reference(c => c.ChapterInfo).Load();
          dbContext.Entry(comp.ChapterInfo).Collection(ci => ci.Chapters).Load();
        }

        GetChapters(dbContext, item.ChapterInfo.Chapters);

        SortChapters(item.ChapterInfo.Chapters);
      }
      catch (Exception exc)
      {
        Log(1, this, () =>
          $"{item}, throwing{Environment.NewLine}" +
          $"{exc.Summary()})");
        throw;
      }
    }

    public IEnumerable<Chapter> GetChaptersFlattened(IBookCommon item, List<List<ChapterExtract>> accuChapters)
    {
      GetChapters(item);

      var flattened = new List<Chapter>();

      GetChaptersFlattened(item.ChapterInfo?.Chapters, flattened, accuChapters, -1);

      return flattened;
    }

    public AudioQuality UpdateLicenseAndChapters(
      Oahu.Audible.Json.ContentLicense license,
      Conversion conversion,
      EDownloadQuality downloadQuality)
    {
      using var logGuard = new LogGuard(3, this, () => conversion.ToString());
      try
      {
        using var dbContext = new BookDbContext(DbDir);
        dbContext.Conversions.Attach(conversion);

        conversion.DownloadUrl = license.ContentMetadata.ContentUrl.OfflineUrl;

        var product = conversion.BookCommon;

        if (product is Component comp)
        {
          dbContext.Components.Attach(comp);
        }
        else if (product is Book book)
        {
          dbContext.Books.Attach(book);
        }

        var voucher = license.Voucher;

        // Key and IV
        product.LicenseKey = voucher?.Key;
        product.LicenseIv = voucher?.Iv;

        var aq = SetDownloadFilenameAndCodec(license, conversion, downloadQuality);

        // file size
        product.FileSizeBytes = license.ContentMetadata?.ContentReference?.ContentSizeInBytes;

        // duration
        int? runtime = license.ContentMetadata?.ChapterInfo?.RuntimeLengthSec;
        if (runtime.HasValue)
        {
          product.RunTimeLengthSeconds = runtime;
        }

        // chapters
        AddChapters(dbContext, license, conversion);

        UpdateState(conversion, EConversionState.LicenseGranted);

        dbContext.SaveChanges();
        return aq;
      }
      catch (Exception exc)
      {
        Log(1, this, () =>
          $"{conversion}, throwing{Environment.NewLine}" +
          $"{exc.Summary()})");
        throw;
      }
    }

    public void CheckUpdateFilesAndState(
      ProfileId profileId,
      IDownloadSettings downloadSettings,
      IExportSettings exportSettings,
      Action<IConversion> callbackRefConversion,
      IInteractionCallback<InteractionMessage<BookLibInteract>, bool?> interactCallback)
    {
      using var lg = new LogGuard(3, this);
      using var dbContext = new BookDbContextLazyLoad(DbDir);

      var collectedCallbacks = new List<IConversion>();

      var conversions = dbContext.Conversions
        .ToList();

      conversions = conversions
        .Where(c => c.AccountId == profileId.AccountId && c.Region == profileId.Region)
        .ToList();

      var dnlddir = downloadSettings.DownloadDirectory;
      foreach (var conv in conversions)
      {
        _ = conv.State switch
        {
          EConversionState.LocalLocked => CheckLocalLocked(conv, Callback, dnlddir),
          EConversionState.LocalUnlocked => CheckLocalUnlocked(conv, Callback, dnlddir),
          EConversionState.Exported => CheckExported(conv, Callback, dnlddir, exportSettings?.ExportDirectory),
          EConversionState.Converted => CheckConverted(conv, Callback, dnlddir),
          _ => false
        };
        CheckRemoved(conv, Callback);
      }

      if (collectedCallbacks.Any())
      {
        if (!checkUpdateAnswered && interactCallback is not null)
        {
          checkUpdateAnswer = interactCallback.Interact(
            new InteractionMessage<BookLibInteract>(
              ECallbackType.Question3,
              null,
              new(EBookLibInteract.CheckFile)));
          checkUpdateAnswered = true;
        }

        Log(3, this, () => $"Interact response={checkUpdateAnswer}");

        if (!checkUpdateAnswer.HasValue)
        {
          return;
        }

        collectedCallbacks.ForEach(c => callbackRefConversion(c));

        if (checkUpdateAnswer.HasValue && checkUpdateAnswer.Value)
        {
          dbContext.SaveChanges();
        }
      }

      void Callback(IConversion conv)
      {
        collectedCallbacks.Add(conv);
      }
    }

    // internal instead of private for testing only
    internal static void AddChapters(BookDbContext dbContext, Oahu.Audible.Json.ContentLicense license, Conversion conversion)
    {
      var source = license?.ContentMetadata?.ChapterInfo;
      if (source is null)
      {
        return;
      }

      var product = conversion.BookCommon;

      ChapterInfo chapterInfo = new ChapterInfo();
      dbContext.ChapterInfos.Add(chapterInfo);
      if (product is Book book)
      {
        dbContext.Entry(book).Reference(b => b.ChapterInfo).Load();
        if (book.ChapterInfo is not null)
        {
          dbContext.Remove(book.ChapterInfo);
        }

        book.ChapterInfo = chapterInfo;
      }
      else if (product is Component comp)
      {
        dbContext.Entry(comp).Reference(b => b.ChapterInfo).Load();
        if (comp.ChapterInfo is not null)
        {
          dbContext.Remove(comp.ChapterInfo);
        }

        comp.ChapterInfo = chapterInfo;
      }

      chapterInfo.BrandIntroDurationMs = source.BrandIntroDurationMs ?? 0;
      chapterInfo.BrandOutroDurationMs = source.BrandOutroDurationMs ?? 0;
      chapterInfo.IsAccurate = source.IsAccurate;
      chapterInfo.RuntimeLengthMs = source.RuntimeLengthMs ?? 0;

      if (source.Chapters.IsNullOrEmpty())
      {
        return;
      }

      foreach (var ch in source.Chapters)
      {
        Chapter chapter = new Chapter();
        dbContext.Chapters.Add(chapter);
        chapterInfo.Chapters.Add(chapter);

        SetChapter(ch, chapter);

        if (!ch.Chapters.IsNullOrEmpty())
        {
          AddChapters(dbContext, ch, chapter);
        }
      }
    }

    private static void UpdateState(Conversion conversion, EConversionState state, Conversion original = null)
    {
      conversion.State = state;
      conversion.LastUpdate = DateTime.UtcNow;
      if (original is not null)
      {
        original.State = conversion.State;
        original.LastUpdate = conversion.LastUpdate;
        original.PersistState = conversion.State;
      }
    }

    private static AudioQuality SetDownloadFilenameAndCodec(
      Oahu.Audible.Json.ContentLicense license,
      Conversion conversion,
      EDownloadQuality downloadQuality)
    {
      var product = conversion.BookCommon;

      product.DownloadQuality = downloadQuality;

      // download destination
      string dir = conversion.DownloadFileName;

      var sb = new StringBuilder();

      // title plus asin plus codec.aaxc.m4b
      string title = product.Title.Prune();
      title = title.Substring(0, Math.Min(20, title.Length));
      sb.Append(title);

      string asin = product.Asin;
      sb.Append($"_{asin}_LC");

      AudioQuality aq = null;
      string format = license.ContentMetadata?.ContentReference?.ContentFormat?.ToLower();
      bool succ = ExCodec.TryParseCodec(format, out ECodec codec);
      if (succ)
      {
        product.FileCodec = codec;
        aq = codec.ToQuality();
        if (aq is not null)
        {
          product.BitRate = aq.BitRate;
          product.SampleRate = aq.SampleRate;
          if (aq.BitRate.HasValue)
          {
            sb.Append($"_{aq.BitRate.Value}");
          }

          if (aq.SampleRate.HasValue)
          {
            sb.Append($"_{aq.SampleRate.Value}");
          }
        }
      }

      string filename = sb.ToString(); // + ".aaxc.m4b";
      string path = Path.Combine(dir, filename);
      conversion.DownloadFileName = path;
      return aq;
    }

    private static void SetChapter(Oahu.Audible.Json.Chapter src, Chapter chapter)
    {
      chapter.LengthMs = src.LengthMs ?? 0;
      chapter.StartOffsetMs = src.StartOffsetMs ?? 0;
      chapter.Title = src.Title;
    }

    private static void AddChapters(BookDbContext dbContext, Oahu.Audible.Json.Chapter source, Chapter parent)
    {
      foreach (var ch in source.Chapters)
      {
        Chapter chapter = new Chapter();
        dbContext.Chapters.Add(chapter);

        parent.Chapters.Add(chapter);

        SetChapter(ch, chapter);

        if (!ch.Chapters.IsNullOrEmpty())
        {
          AddChapters(dbContext, ch, chapter);
        }
      }
    }

    private static Book AddBook(BookDbContextLazyLoad dbContext, Oahu.Audible.Json.Product product)
    {
      Book book = new Book
      {
        Asin = product.Asin,
        Title = product.Title,
        Subtitle = product.Subtitle,
        PublisherName = product.PublisherName,
        PublisherSummary = product.PublisherSummary,
        MerchandisingSummary = product.MerchandisingSummary,
        AverageRating = product.Rating?.OverallDistribution?.AverageRating,
        RunTimeLengthSeconds = product.RuntimeLengthMin.HasValue ? product.RuntimeLengthMin.Value * 60 : null,
        AdultProduct = product.IsAdultProduct,
        PurchaseDate = product.PurchaseDate,
        ReleaseDate = product.ReleaseDate ?? product.IssueDate,
        Language = product.Language,
        CoverImageUrl = product.ProductImages?.Image500,
        Sku = product.Sku,
        SkuLite = product.SkuLite
      };

      bool succ = Enum.TryParse<EDeliveryType>(product.ContentDeliveryType, out var deltype);
      if (succ)
      {
        book.DeliveryType = deltype;
      }

      if (!product.FormatType.IsNullOrEmpty())
      {
        book.Unabridged = product.FormatType == "unabridged";
      }

      dbContext.Books.Add(book);
      return book;
    }

    private static void AddComponents(Book book, ICollection<Component> components, IEnumerable<Oahu.Audible.Json.Relationship> itmRelations)
    {
      var relations = itmRelations?
        .Where(r => r.RelationshipToProduct == "child" && r.RelationshipType == "component")
        .ToList();

      if (relations.IsNullOrEmpty())
      {
        return;
      }

      foreach (var rel in relations)
      {
        int.TryParse(rel.Sort, out int partNum);
        var component = new Component
        {
          Asin = rel.Asin,
          Title = rel.Title,
          Sku = rel.Sku,
          SkuLite = rel.SkuLite,
          PartNumber = partNum
        };

        components.Add(component);
        book.Components.Add(component);
      }
    }

    private static void AddSeries(Book book, ICollection<Series> series, ICollection<SeriesBook> seriesBooks, IEnumerable<Oahu.Audible.Json.Relationship> itmRelations)
    {
      if (itmRelations is null)
      {
        return;
      }

      var itmSeries = itmRelations.Where(r => r.RelationshipToProduct == "parent" && r.RelationshipType == "series").ToList();

      foreach (var itmSerie in itmSeries)
      {
        var serie = series.FirstOrDefault(s => s.Asin == itmSerie.Asin);
        if (serie is null)
        {
          serie = new Series
          {
            Asin = itmSerie.Asin,
            Title = itmSerie.Title,
            Sku = itmSerie.Sku,
            SkuLite = itmSerie.SkuLite
          };
          series.Add(serie);
        }

        var seriesBook = new SeriesBook
        {
          Book = book,
          Series = serie,
          Sequence = itmSerie.Sequence
        };

        bool succ = int.TryParse(itmSerie.Sort, out int sort);
        if (succ)
        {
          seriesBook.Sort = sort;
        }

        Match match = RegexSeries.Match(itmSerie.Sequence);
        if (match.Success)
        {
          int n = match.Groups.Count;
          if (n >= 2)
          {
            string major = match.Groups[1].Value;
            succ = int.TryParse(major, out int num);
            if (succ)
            {
              seriesBook.BookNumber = num;

              if (n >= 3)
              {
                string minor = match.Groups[3].Value;
                succ = int.TryParse(minor, out int subnum);
                if (succ)
                {
                  seriesBook.SubNumber = int.Parse(minor);
                }
              }
            }
          }
        }

        seriesBooks.Add(seriesBook);
        book.Series.Add(seriesBook);
      }
    }

    private static void AddPersons<TPerson>(
      BookDbContextLazyLoad dbContext,
      Book book,
      ICollection<TPerson> persons,
      IEnumerable<Oahu.Audible.Json.IPerson> itmPersons,
      Func<Book, ICollection<TPerson>> getBookPersons)
      where TPerson : class, IPerson, new()
    {
      if (itmPersons is null)
      {
        return;
      }

      foreach (var itmPerson in itmPersons)
      {
        TPerson person = null;
        if (itmPerson.Asin is null)
        {
          person = persons.FirstOrDefault(a => a.Name == itmPerson.Name);
          if (person is null)
          {
            itmPerson.Asin = dbContext.GetNextPseudoAsin(typeof(TPerson));
          }
        }

        if (person is null)
        {
          person = persons.FirstOrDefault(a => a.Asin == itmPerson.Asin);
        }

        if (person is null)
        {
          person = new TPerson
          {
            Asin = itmPerson.Asin,
            Name = itmPerson.Name
          };

          persons.Add(person);
        }

        person.Books.Add(book);
        getBookPersons(book).Add(person);
      }
    }

    private static void AddGenres(Book book, ICollection<Genre> genres, ICollection<Ladder> ladders, ICollection<Rung> rungs, IEnumerable<Oahu.Audible.Json.Category> itmCategories)
    {
      if (itmCategories is null)
      {
        return;
      }

      var categories = itmCategories.Where(c => c.Root == "Genres").ToList();

      foreach (var category in categories)
      {
        var ladder = new Ladder();

        for (int i = 0; i < category.Ladder.Length; i++)
        {
          var itmLadder = category.Ladder[i];
          int idx = i + 1;
          bool succ = long.TryParse(itmLadder.Id, out long id);
          if (!succ)
          {
            continue;
          }

          var genre = genres.FirstOrDefault(g => g.ExternalId == id);
          if (genre is null)
          {
            genre = new Genre
            {
              ExternalId = id,
              Name = itmLadder.Name
            };
            genres.Add(genre);
          }

          book.Genres.Add(genre);

          var rung = rungs.FirstOrDefault(r => r.OrderIdx == idx && r.Genre == genre);
          if (rung is null)
          {
            rung = new Rung
            {
              OrderIdx = idx,
              Genre = genre
            };
            rungs.Add(rung);
          }

          ladder.Rungs.Add(rung);
        }

        var existingLadder = ladders.FirstOrDefault(l => Equals(l, ladder));

        if (existingLadder is null)
        {
          ladders.Add(ladder);
        }
        else
        {
          ladder = existingLadder;
        }

        book.Ladders.Add(ladder);
      }

      // local function
      static bool Equals(Ladder oldLadder, Ladder newLadder)
      {
        if (newLadder.Rungs.Count != oldLadder.Rungs.Count)
        {
          return false;
        }

        var rungs = oldLadder.Rungs.OrderBy(r => r.OrderIdx);
        var iter1 = newLadder.Rungs.GetEnumerator();
        var iter2 = rungs.GetEnumerator();
        while (iter1.MoveNext())
        {
          iter2.MoveNext();
          var r1 = iter1.Current;
          var r2 = iter2.Current;
          if (r1.Genre != r2.Genre)
          {
            return false;
          }
        }

        return true;
      }
    }

    private static void AddCodecs(Book book, ICollection<Codec> codecList, IEnumerable<Oahu.Audible.Json.Codec> itmCodecs)
    {
      if (itmCodecs is null)
      {
        return;
      }

      foreach (var itmCodec in itmCodecs)
      {
        bool succ = ExCodec.TryParseCodec(itmCodec.Name, out var codecName);
        if (!succ)
        {
          continue;
        }

        var codec = codecList.FirstOrDefault(c => c.Name == codecName);
        if (codec is null)
        {
          codec = new Codec
          {
            Name = codecName
          };

          codecList.Add(codec);
        }

        book.Codecs.Add(codec);
      }
    }

    private static void AddConversions(Book book, ICollection<Conversion> conversions, ProfileId profileId)
    {
      // default
      {
        var conversion = new Conversion
        {
          AccountId = profileId.AccountId,
          Region = profileId.Region
        };
        UpdateState(conversion, EConversionState.Remote);
        book.Conversion = conversion;
        conversions.Add(conversion);
      }

      // components
      foreach (var component in book.Components)
      {
        if (component.Conversion is not null)
        {
          continue;
        }

        var conversion = new Conversion
        {
          State = EConversionState.Remote,
          AccountId = profileId.AccountId,
          Region = profileId.Region
        };
        component.Conversion = conversion;
        conversions.Add(conversion);
      }
    }

    private void SetAccountAlias(int id, string alias)
    {
      using var logGuard = new LogGuard(3, this, () => $"id = {id}, alias = \"{alias}\"");
      if (alias.IsNullOrWhiteSpace())
      {
        return;
      }

      using var dbContext = new BookDbContextLazyLoad(DbDir);
      var account = dbContext.Accounts.FirstOrDefault(a => a.Id == id);
      if (account is null)
      {
        return;
      }

      account.Alias = alias;
      dbContext.SaveChanges();
    }

    private void CheckRemoved(Conversion conv, Action<IConversion> callback)
    {
      var book = conv.Book;
      if (book?.Deleted is null)
      {
        return;
      }

      bool removed = book.Deleted.Value;
      if (removed)
      {
        if (conv.State > EConversionState.Unknown && conv.State < EConversionState.LocalLocked)
        {
          UpdateState(conv, EConversionState.Unknown);
          callback(conv);
          Log(3, this, () => $"removed: {conv}");
        }

        foreach (var comp in book.Components)
        {
          var cconv = comp.Conversion;
          if (cconv.State > EConversionState.Unknown && cconv.State < EConversionState.LocalLocked)
          {
            UpdateState(cconv, EConversionState.Unknown);
            callback(cconv);
            Log(3, this, () => $"removed: {cconv}");
          }
        }
      }
      else
      {
        if (conv.State == EConversionState.Unknown)
        {
          UpdateState(conv, EConversionState.Remote);
          callback(conv);
          Log(3, this, () => $"re-added: {conv}");
        }

        foreach (var comp in book.Components)
        {
          var cconv = comp.Conversion;
          if (cconv.State == EConversionState.Unknown)
          {
            UpdateState(cconv, EConversionState.Remote);
            callback(cconv);
            Log(3, this, () => $"re-added: {cconv}");
          }
        }
      }
    }

    private bool CheckLocalLocked(Conversion conv, Action<IConversion> callback, string downloadDirectory) =>
      CheckFile(conv, R.EncryptedFileExt, callback, downloadDirectory,
        EConversionState.Remote, ECheckFile.DeleteIfMissing | ECheckFile.Relocatable);

    private bool CheckLocalUnlocked(Conversion conv, Action<IConversion> callback, string downloadDirectory)
    {
      return CheckLocal(conv, callback, downloadDirectory);
    }

    private bool CheckLocal(
      Conversion conv,
      Action<IConversion> callback,
      string downloadDirectory,
      EConversionState? transientfallback = null)
    {
      bool succ = CheckFile(conv, R.DecryptedFileExt, callback, downloadDirectory,
        EConversionState.LocalLocked, ECheckFile.Relocatable, transientfallback);
      if (!succ)
      {
        succ = CheckFile(conv, R.EncryptedFileExt, callback, downloadDirectory,
          EConversionState.Remote, ECheckFile.DeleteIfMissing | ECheckFile.Relocatable, transientfallback);
      }

      return succ;
    }

    private bool CheckExported(
      Conversion conv, Action<IConversion> callback,
      string downloadDirectory, string exportDirectory)
    {
      bool succ = CheckFile(conv, R.ExportedFileExt, callback, exportDirectory,
        EConversionState.LocalUnlocked, ECheckFile.None, EConversionState.ConvertedUnknown);
      if (!succ)
      {
        succ = CheckLocal(conv, callback, downloadDirectory, EConversionState.ConvertedUnknown);
      }

      return succ;
    }

    private bool CheckConverted(Conversion conv, Action<IConversion> callback, string downloadDirectory)
    {
      bool succ = CheckConvertedFiles(conv, callback);
      if (!succ)
      {
        succ = CheckLocal(conv, callback, downloadDirectory, EConversionState.ConvertedUnknown);
      }

      return succ;
    }

    private bool CheckConvertedFiles(Conversion conv, Action<IConversion> callback)
    {
      string dir = conv.DestDirectory.AsUncIfLong();
      bool exists = false;
      if (Directory.Exists(dir))
      {
        string[] files = Directory.GetFiles(dir);
        exists = files
          .Select(f => Path.GetExtension(f).ToLower())
          .Where(e => Extensions.Contains(e))
          .Any();
      }

      if (exists)
      {
        return true;
      }
      else
      {
        Log(3, this, () => $"not found: \"{conv.DownloadFileName.GetDownloadFileNameWithoutExtension()}\"");
        conv.State = EConversionState.ConvertedUnknown;
        callback?.Invoke(conv);
        return false;
      }
    }

    private bool CheckFile(
      Conversion conv,
      string ext,
      Action<IConversion> callback,
      string downloadDirectory,
      EConversionState fallback,
      ECheckFile flags,
      EConversionState? transientfallback = null)
    {
      if (flags.HasFlag(ECheckFile.Relocatable))
      {
        if (downloadDirectory is null)
        {
          return false;
        }

        string path = (conv.DownloadFileName + ext).AsUncIfLong();
        if (File.Exists(path))
        {
          return true;
        }

        if (conv.DownloadFileName is not null)
        {
          string filename = conv.DownloadFileName.GetDownloadFileNameWithoutExtension();
          string pathStub = Path.Combine(downloadDirectory, filename);
          path = (pathStub + ext).AsUncIfLong();

          if (File.Exists(path))
          {
            conv.DownloadFileName = pathStub;
            return true;
          }
        }
      }
      else
      {
        string filename = conv.DownloadFileName.GetDownloadFileNameWithoutExtension();
        string pathStub = Path.Combine(downloadDirectory, filename);
        string path = (pathStub + ext).AsUncIfLong();
        if (File.Exists(path))
        {
          return true;
        }
      }

      Log(3, this, () => $"not found \"{ext}\": \"{conv.DownloadFileName.GetDownloadFileNameWithoutExtension()}\"");

      if (flags.HasFlag(ECheckFile.DeleteIfMissing))
      {
        conv.DownloadFileName = null;
      }

      if (transientfallback.HasValue)
      {
        var tmp = conv.Copy();
        tmp.State = transientfallback.Value;
        callback?.Invoke(tmp);
      }

      UpdateState(conv, fallback);
      if (!transientfallback.HasValue)
      {
        callback?.Invoke(conv);
      }

      return false;
    }

    private void AddRemBooks(List<Oahu.Audible.Json.Product> libProducts, ProfileId profileId, bool resync)
    {
      lock (BookCache)
      {
        BookCache.Remove(profileId);
      }

      using var dbContext = new BookDbContextLazyLoad(DbDir);

      var bcl = new BookCompositeLists(
        dbContext.Books.Select(b => b.Asin).ToList(),
        dbContext.Conversions.ToList(),
        dbContext.Components.ToList(),
        dbContext.Series.ToList(),
        dbContext.SeriesBooks.ToList(),
        dbContext.Authors.ToList(),
        dbContext.Narrators.ToList(),
        dbContext.Genres.ToList(),
        dbContext.Ladders.ToList(),
        dbContext.Rungs.ToList(),
        dbContext.Codecs.ToList());

      int page = 0;
      int remaining = libProducts.Count;
      while (remaining > 0)
      {
        int count = Math.Min(remaining, PageSize);
        int start = page * PageSize;
        page++;
        remaining -= count;
        var subrange = libProducts.GetRange(start, count);
        AddPageBooks(dbContext, bcl, subrange, profileId, resync);
      }

      if (resync)
      {
        RemoveBooks(dbContext, bcl, libProducts, profileId);
      }
    }

    private DateTime SinceLatestPurchaseDate(ProfileId profileId, bool resync)
    {
      DateTime dt = new DateTime(1970, 1, 1);
      if (resync)
      {
        return dt;
      }

      using var dbContext = new BookDbContextLazyLoad(DbDir);

      var latest = dbContext.Books
          .Where(b => b.PurchaseDate.HasValue &&
            b.Conversion.AccountId == profileId.AccountId &&
            b.Conversion.Region == profileId.Region)
          .Select(b => b.PurchaseDate.Value)
          .OrderBy(b => b)
          .LastOrDefault();
      if (latest != default)
      {
        dt = latest + TimeSpan.FromMilliseconds(1);
      }

      return dt;
    }

    private void CleanupDuplicateAuthors()
    {
      using var dbContext = new BookDbContextLazyLoad(DbDir);

      var authors = dbContext.Authors;

      var duplicates = authors
        .ToList()
        .GroupBy(x => x.Name)
        .Where(g => g.Count() > 1)
        .ToList();

      const int PseudoKeyLength = 7;
      foreach (var d in duplicates)
      {
        var asinAuthor = d.FirstOrDefault(d => d.Asin.Length > PseudoKeyLength);
        if (asinAuthor is null)
        {
          continue;
        }

        foreach (var author in d)
        {
          if (author == asinAuthor)
          {
            continue;
          }

          foreach (var book in author.Books)
          {
            book.Authors.Remove(author);
            book.Authors.Add(asinAuthor);
          }

          authors.Remove(author);
        }
      }

      dbContext.SaveChanges();
    }

    private void AddPageBooks(BookDbContextLazyLoad dbContext, BookCompositeLists bcl, IEnumerable<Oahu.Audible.Json.Product> products, ProfileId profileId, bool resync)
    {
      try
      {
        using var logGuard = new LogGuard(3, this, () => $"#items={products.Count()}");

        foreach (var product in products)
        {
          try
          {
            if (Readd(bcl, product, profileId, resync))
            {
              continue;
            }

            Book book = AddBook(dbContext, product);

            AddComponents(book, bcl.Components, product.Relationships);

            AddConversions(book, bcl.Conversions, profileId);

            AddSeries(book, bcl.Series, bcl.SeriesBooks, product.Relationships);

            AddPersons(dbContext, book, bcl.Authors, product.Authors, b => b.Authors);
            AddPersons(dbContext, book, bcl.Narrators, product.Narrators, b => b.Narrators);

            AddGenres(book, bcl.Genres, bcl.Ladders, bcl.Rungs, product.CategoryLadders);

            AddCodecs(book, bcl.Codecs, product.AvailableCodecs);

            Log(3, this, () => $"added: {book}");
          }
          catch (Exception exc)
          {
            Log(1, this, () =>
              $"asin={product.Asin}, \"{product.Title}\", throwing{Environment.NewLine}" +
              $"{exc.Summary()})");
            throw;
          }
        }

        dbContext.SaveChanges();
      }
      catch (DbUpdateException exc)
      {
        Log(1, this, () => exc.ToString());
        throw;
      }
      catch (Exception exc)
      {
        Log(1, this, () => exc.Summary());
        throw;
      }
    }

    private bool Readd(BookCompositeLists bcl, Oahu.Audible.Json.Product product, ProfileId profileId, bool resync)
    {
      if (bcl.BookAsins.Contains(product.Asin))
      {
        if (!resync)
        {
          return true;
        }

        var bk = bcl.Conversions
          .FirstOrDefault(conv => string.Equals(conv.Book?.Asin, product.Asin))?.Book;
        if (!(bk?.Deleted ?? false))
        {
          return true;
        }

        bk.Deleted = false;
        bk.Conversion.AccountId = profileId.AccountId;
        bk.Conversion.Region = profileId.Region;
        if (bk.Conversion.State < EConversionState.LocalLocked)
        {
          UpdateState(bk.Conversion, EConversionState.Remote);
        }

        foreach (var comp in bk.Components)
        {
          if (comp.Conversion.State < EConversionState.LocalLocked)
          {
            UpdateState(comp.Conversion, EConversionState.Remote);
          }

          comp.Conversion.AccountId = profileId.AccountId;
          comp.Conversion.Region = profileId.Region;
        }

        Log(3, this, () => $"readded: {bk}");

        return true;
      }
      else
      {
        return false;
      }
    }

    private void RemoveBooks(
      BookDbContextLazyLoad dbContext,
      BookCompositeLists bcl,
      IEnumerable<Oahu.Audible.Json.Product> products,
      ProfileId profileId)
    {
      try
      {
        using var logGuard = new LogGuard(3, this, () => $"#items={products.Count()}");

        var currentAsins = products.Select(p => p.Asin).ToList();
        var removeAsins = bcl.BookAsins.Except(currentAsins).ToList();
        if (!removeAsins.Any())
        {
          return;
        }

        Log(3, this, () => $"# to be removed={removeAsins.Count} (not yet filtered by profile)");

        int nRemoved = 0;
        foreach (string asin in removeAsins)
        {
          var book = bcl.Conversions.FirstOrDefault(conv => string.Equals(conv.Book?.Asin, asin))?.Book;
          if (book is null)
          {
            continue;
          }

          if (book.Conversion.AccountId != profileId.AccountId || book.Conversion.Region != profileId.Region)
          {
            Log(3, this, () => $"different profile, ignored: {asin}");
            continue;
          }

          book.Deleted = true;
          if (book.Conversion.State < EConversionState.LocalLocked)
          {
            UpdateState(book.Conversion, EConversionState.Unknown);
          }

          foreach (var comp in book.Components)
          {
            if (comp.Conversion.State < EConversionState.LocalLocked)
            {
              UpdateState(comp.Conversion, EConversionState.Unknown);
            }
          }

          Log(3, this, () => $"marked as removed: {book}");
          nRemoved++;
        }

        dbContext.SaveChanges();
        Log(3, this, () => $"# actually marked as removed={nRemoved}");
      }
      catch (Exception exc)
      {
        Log(1, this, () => exc.Summary());
        throw;
      }
    }

    private void GetChaptersFlattened(IEnumerable<Chapter> source, List<Chapter> dest, List<List<ChapterExtract>> accuChapters, int level)
    {
      if (source.IsNullOrEmpty())
      {
        return;
      }

      using var rg = new ResourceGuard(x =>
      {
        if (x)
        {
          level++;
        }
        else
        {
          level--;
        }
      });
      if (accuChapters?.Count < level + 1)
      {
        accuChapters?.Add(new List<ChapterExtract>());
      }

      var accu = accuChapters?[level];
      foreach (var ch in source)
      {
        dest.Add(new Chapter(ch));
        accu?.Add(new ChapterExtract(ch.Title, ch.LengthMs));
        GetChaptersFlattened(ch.Chapters, dest, accuChapters, level);
      }
    }

    private void GetChapters(BookDbContext dbContext, ICollection<Chapter> chapters)
    {
      if (chapters.IsNullOrEmpty())
      {
        return;
      }

      foreach (var ch in chapters)
      {
        dbContext.Entry(ch).Collection(ci => ci.Chapters).Load();
        GetChapters(dbContext, ch.Chapters);
      }
    }

    private void SortChapters(ICollection<Chapter> chapters)
    {
      if (chapters.IsNullOrEmpty())
      {
        return;
      }

      if (chapters is List<Chapter> list)
      {
        list.Sort((x, y) => x.StartOffsetMs.CompareTo(y.StartOffsetMs));
      }

      chapters.ForEach(ch => SortChapters(ch.Chapters));
    }
  }
}
