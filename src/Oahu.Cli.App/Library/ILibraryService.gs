package Oahu.Cli.App.Library

import Oahu.Cli.App.Models
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

data class LibraryFilter {
    prop Search string? {
        get;
        init;
    }

    prop Author string? {
        get;
        init;
    }

    prop Series string? {
        get;
        init;
    }

    private var _availableOnly bool = true

    prop AvailableOnly bool {
        get {
            return _availableOnly
        }
        init {
            _availableOnly = value
        }
    }
}

/// Library boundary — list/show/sync. Phase 3 ships this interface plus a fake.
/// The Core-backed `BookLibraryService` wrapping `Oahu.Core.IBookLibrary`
/// + `BooksDbContext` lands in Phase 4 alongside `library list/sync/show`.
interface ILibraryService {
    func ListAsync(filter LibraryFilter? = nil, cancellationToken CancellationToken = default(CancellationToken)) Task[
        IReadOnlyList[LibraryItem]
    ];

    func GetAsync(asin string, cancellationToken CancellationToken = default(CancellationToken)) Task[LibraryItem?];

    /// Pulls the latest library snapshot from Audible. Returns the new item count.
    func SyncAsync(profileAlias string, cancellationToken CancellationToken = default(CancellationToken)) Task[int32];

    /// Ensures the local library cache is fresh by performing an incremental refresh
    /// from Audible (like the GUI does on startup). Idempotent — only contacts Audible
    /// once per process lifetime. Silently succeeds if no profile is active or if the
    /// network call fails.
    func EnsureFreshAsync(cancellationToken CancellationToken = default(CancellationToken)) Task;

    /// Forces an incremental library refresh from Audible right now, bypassing the
    /// once-per-process cache used by (cref:EnsureFreshAsync). Use this when
    /// the user explicitly asks to refresh (e.g. the Home screen 'r' key) so that
    /// recently-purchased titles show up without restarting the process.
    func RefreshAsync(cancellationToken CancellationToken = default(CancellationToken)) Task;
}
