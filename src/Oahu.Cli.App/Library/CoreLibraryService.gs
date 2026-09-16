package Oahu.Cli.App.Library

import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import Oahu.BooksDatabase
import Oahu.Cli.App.Core
import Oahu.Cli.App.Models
import Oahu.Core
import Oahu.Audible.Json

/// Core-backed (cref:ILibraryService). Reads books through
/// (cref:AudibleClient.Api)'s `GetBooks()` (which queries the local
/// books DB scoped to the active profile) and synchronises with Audible via
/// `GetLibraryAsync(resync)`.
class CoreLibraryService : ILibraryService {
    private let client AudibleClient
    private let refreshGate SemaphoreSlim = SemaphoreSlim(1, 1)
    private var refreshed bool

    convenience init() {
        init(CoreEnvironment.Client)
    }

    init(client AudibleClient) {
        this.client = client ?? throw ArgumentNullException("client")
    }

    async func ListAsync(
        filter LibraryFilter? = nil,
        cancellationToken CancellationToken = default(CancellationToken)
    ) IReadOnlyList[LibraryItem] {
        var filter = filter
        cancellationToken.ThrowIfCancellationRequested()
        await EnsureFreshAsync(cancellationToken).ConfigureAwait(false)
        let api IAudibleApi? = client.Api
        if api == nil {
            // No active profile — empty library, not an error. Commands surface
            // the "no active profile" hint when results are empty.
            return Array.Empty[LibraryItem]()
        }
        let books = api.GetBooks() ?? Enumerable.Empty[Book]()
        filter ??= LibraryFilter()
        var items = books.Select(MapBook)
        items = ApplyFilter(items, filter!!)
        return items.ToArray()
    }

    async func GetAsync(asin string, cancellationToken CancellationToken = default(CancellationToken)) LibraryItem? {
        ArgumentException.ThrowIfNullOrWhiteSpace(asin)
        cancellationToken.ThrowIfCancellationRequested()
        await EnsureFreshAsync(cancellationToken).ConfigureAwait(false)
        let api IAudibleApi? = client.Api
        if api == nil {
            return nil
        }
        let book Book? = api.GetBooks()?.FirstOrDefault(
            (b Book) -> string.Equals(b.Asin, asin, StringComparison.OrdinalIgnoreCase)
        )
        return if book == nil {
            default(LibraryItem?)
        } else {
            MapBook(book)
        }
    }

    async func SyncAsync(profileAlias string, cancellationToken CancellationToken = default(CancellationToken)) int32 {
        ArgumentException.ThrowIfNullOrWhiteSpace(profileAlias)
        cancellationToken.ThrowIfCancellationRequested()
        await CoreEnvironment.EnsureProfileLoadedAsync().ConfigureAwait(false)
        // Switch to the requested profile if it's not the active one. The CLI lets
        // any signed-in alias be sync'd; without this, SyncAsync silently sync'd
        // whichever profile the GUI happened to have last activated, even when the
        // caller passed a different alias.
        let aliases = client.GetAccountAliases()?.ToDictionary(
            (a AccountAlias) -> a.AccountId,
            (a AccountAlias) -> a.Alias,
            StringComparer.Ordinal
        ) ?? Dictionary[string, string](StringComparer.Ordinal)
        let activeKey IProfileKey? = client.ProfileKey
        let activeAlias = if activeKey != nil && aliases.TryGetValue(activeKey.AccountId!!, out var aliasForActive) {
            aliasForActive!!
        } else {
            default(string?)
        }
        if !string.Equals(activeAlias, profileAlias, StringComparison.Ordinal) {
            let profiles = await client.GetProfilesAsync().ConfigureAwait(false)
            let key = profiles?.FirstOrDefault(
                (p IProfileKeyEx) -> aliases.TryGetValue(p.AccountId!!, out var alias) && string.Equals(
                    alias,
                    profileAlias,
                    StringComparison.Ordinal
                )
            ) ?? throw InvalidOperationException(
                "No profile with alias '$profileAlias'. Sign in with `oahu-cli auth login` first."
            )
            await client.ChangeProfileAsync(key, aliasChanged: false).ConfigureAwait(false)
        }
        let api = client.Api ?? throw InvalidOperationException("Failed to load profile '$profileAlias' for sync.")
        // resync=true forces a full library refresh; the CLI surface does not
        // (yet) distinguish full vs incremental, so we do a full pull every
        // time. 4c's job-runner will introduce an incremental option.
        let libraryResponse LibraryResponse? = await api.GetLibraryAsync(resync: true).ConfigureAwait(false)
        if libraryResponse == nil {
            // AudibleApi.GetLibraryAsync silently returns null on any HTTP error
            // (see SendForStringAsync's catch in src/Oahu.Core/AudibleApi.gs).
            // Surface that as a real failure rather than reporting "0 books"
            // and leaving the user wondering why a fresh sign-in produced
            // an empty library.
            throw InvalidOperationException(
                "Library sync for '$profileAlias' failed: the Audible API returned no data. " +
                    "This usually indicates an authentication or network problem; check the Oahu log " +
                    "(under ~/Library/Application Support/Oahu/log) for HTTP details."
            )
        }
        let books = api.GetBooks()
        return books?.Count() ?? 0
    }

    /// ```xmldoc
    /// <inheritdoc />
    /// ```
    async func EnsureFreshAsync(cancellationToken CancellationToken = default(CancellationToken)) {
        if refreshed {
            return
        }
        await refreshGate.WaitAsync(cancellationToken).ConfigureAwait(false)
        try {
            if refreshed {
                return
            }
            await CoreEnvironment.EnsureProfileLoadedAsync().ConfigureAwait(false)
            let api IAudibleApi? = client.Api
            if api == nil {
                // No active profile — nothing to refresh.
                refreshed = true
                return
            }
            // Incremental refresh (resync: false) like the GUI does on startup.
            // Only fetches items newer than the last sync point.
            await api.GetLibraryAsync(resync: false).ConfigureAwait(false)
            refreshed = true
        } catch {
            // Network/auth failures are non-fatal for EnsureFreshAsync — the user
            // still gets whatever is in the local cache. An explicit `library sync`
            // surfaces errors properly.
            refreshed = true
        } finally {
            refreshGate.Release()
        }
    }

    /// ```xmldoc
    /// <inheritdoc />
    /// ```
    async func RefreshAsync(cancellationToken CancellationToken = default(CancellationToken)) {
        cancellationToken.ThrowIfCancellationRequested()
        await refreshGate.WaitAsync(cancellationToken).ConfigureAwait(false)
        try {
            // Reset the once-per-process gate so the next ListAsync (or this
            // call) re-contacts Audible for an incremental pull.
            refreshed = false
        } finally {
            refreshGate.Release()
        }
        await EnsureFreshAsync(cancellationToken).ConfigureAwait(false)
    }

    shared {
        private func ApplyFilter(items IEnumerable[LibraryItem], filter LibraryFilter) IEnumerable[LibraryItem] {
            var items = items
            if filter.AvailableOnly {
                items = items.Where((i LibraryItem) -> i.IsAvailable)
            }
            if !string.IsNullOrWhiteSpace(filter.Search) {
                items = items.Where(
                    (i LibraryItem) -> i.Title.Contains(filter.Search!!, StringComparison.OrdinalIgnoreCase)
                )
            }
            if !string.IsNullOrWhiteSpace(filter.Author) {
                items = items.Where(
                    (i LibraryItem) -> i.Authors.Any(
                        (a string) -> a.Contains(filter.Author!!, StringComparison.OrdinalIgnoreCase)
                    )
                )
            }
            if !string.IsNullOrWhiteSpace(filter.Series) {
                items = items.Where(
                    (i LibraryItem) -> string.Equals(i.Series, filter.Series, StringComparison.OrdinalIgnoreCase)
                )
            }
            return items
        }

        /// Where the 500-px cover for this book lives (or would live) on disk.
        /// Prefers the path recorded by a GUI cover download; otherwise derives
        /// the shared cache location (`<data root>/img/<ASIN>.jpg`) so the TUI
        /// can download the cover itself on first view.
        private func ResolveCoverPath(book Book) string? {
            if !string.IsNullOrWhiteSpace(book.CoverImageFile) {
                return book.CoverImageFile
            }
            if string.IsNullOrWhiteSpace(book.CoverImageUrl) || string.IsNullOrWhiteSpace(book.Asin) {
                return nil
            }
            return System.IO.Path.Combine(Oahu.Aux.ApplEnv.LocalApplDirectory, "img", "${book.Asin}.jpg")
        }

        private func MapBook(book Book) LibraryItem {
            let seriesEntry SeriesBook? = book.Series?.FirstOrDefault()
            var seriesPosition float64? = nil
            if seriesEntry != nil {
                // SeriesBook.BookNumber may be 0 (unset); SubNumber is optional.
                // We use a /1000 offset so SubNumber up to 999 maps unambiguously
                // (e.g. Book 1, SubNumber 5 -> 1.005), avoiding collision when
                // SubNumber >= 10 (the previous /10 formula made 1.12 == 2.2).
                if (seriesEntry.SubNumber != nil) {
                    seriesPosition = float64(seriesEntry.BookNumber) + (float64(seriesEntry.SubNumber!!) / 1000.0)
                } else if seriesEntry.BookNumber > 0 {
                    seriesPosition = seriesEntry.BookNumber
                }
            }
            let runtime TimeSpan? = if (book.RunTimeLengthSeconds != nil) {
                TimeSpan.FromSeconds(book.RunTimeLengthSeconds!!)
            } else {
                nil
            }
            let purchase DateTimeOffset? = if (book.PurchaseDate != nil) {
                DateTimeOffset(DateTime.SpecifyKind(book.PurchaseDate!!, DateTimeKind.Utc))
            } else {
                nil
            }
            // "Available" in the CLI sense = not soft-deleted from the user's library.
            let available = !(book.Deleted ?? false)
            // Multi-part is signalled by more than one Component on the book.
            let multiPart = (book.Components?.Count ?? 0) > 1
            return LibraryItem{
                Asin: book.Asin ?? string.Empty,
                Title: book.Title ?? string.Empty,
                Subtitle: if string.IsNullOrWhiteSpace(book.Subtitle) {
                    default(string?)
                } else {
                    book.Subtitle!!
                },
                Authors: book
                    .Authors
                    ?.Select((a Oahu.BooksDatabase.Author) -> a.Name)
                    .Where((n string) -> !string.IsNullOrWhiteSpace(n))
                    .ToArray() ?? Array.Empty[string](),
                Narrators: book
                    .Narrators
                    ?.Select((n Oahu.BooksDatabase.Narrator) -> n.Name)
                    .Where((n string) -> !string.IsNullOrWhiteSpace(n))
                    .ToArray() ?? Array.Empty[string](),
                Series: seriesEntry?.Series?.Title,
                SeriesPosition: seriesPosition,
                Runtime: runtime,
                PurchaseDate: purchase,
                IsAvailable: available,
                HasMultiplePartFiles: multiPart,
                CoverImagePath: ResolveCoverPath(book),
                CoverImageUrl: if string.IsNullOrWhiteSpace(book.CoverImageUrl) {
                    default(string?)
                } else {
                    book.CoverImageUrl!!
                }
            }
        }
    }
}
