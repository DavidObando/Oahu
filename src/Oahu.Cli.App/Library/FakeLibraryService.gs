package Oahu.Cli.App.Library

import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks

/// In-memory (cref:ILibraryService) for tests and offline development.
class FakeLibraryService : ILibraryService {
    private let items List[LibraryItem]

    init(items IEnumerable[LibraryItem]? = nil) {
        this.items = (items ?? Enumerable.Empty[LibraryItem]()).ToList()
    }

    func ListAsync(filter LibraryFilter? = nil, cancellationToken CancellationToken = default(CancellationToken)) Task[
        IReadOnlyList[LibraryItem]
    ] {
        var filter = filter
        cancellationToken.ThrowIfCancellationRequested()
        filter ??= LibraryFilter()
        var q IEnumerable[LibraryItem] = items
        if filter!!.AvailableOnly {
            q = q.Where((i LibraryItem) -> i.IsAvailable)
        }
        if !string.IsNullOrWhiteSpace(filter!!.Search) {
            q = q.Where((i LibraryItem) -> i.Title.Contains(filter!!.Search!!, StringComparison.OrdinalIgnoreCase))
        }
        if !string.IsNullOrWhiteSpace(filter!!.Author) {
            q = q.Where(
                (i LibraryItem) -> i.Authors.Any(
                    (a string) -> a.Contains(filter!!.Author!!, StringComparison.OrdinalIgnoreCase)
                )
            )
        }
        if !string.IsNullOrWhiteSpace(filter!!.Series) {
            q = q.Where((i LibraryItem) -> string.Equals(i.Series, filter!!.Series, StringComparison.OrdinalIgnoreCase))
        }
        return Task.FromResult[IReadOnlyList[LibraryItem]](q.ToArray())
    }

    func GetAsync(asin string, cancellationToken CancellationToken = default(CancellationToken)) Task[LibraryItem?] {
        ArgumentException.ThrowIfNullOrWhiteSpace(asin)
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult(
            items.FirstOrDefault((i LibraryItem) -> string.Equals(i.Asin, asin, StringComparison.OrdinalIgnoreCase))
        )
    }

    func SyncAsync(profileAlias string, cancellationToken CancellationToken = default(CancellationToken)) Task[int32] {
        ArgumentException.ThrowIfNullOrWhiteSpace(profileAlias)
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult(items.Count)
    }

    func EnsureFreshAsync(cancellationToken CancellationToken = default(CancellationToken)) Task {
        cancellationToken.ThrowIfCancellationRequested()
        return Task.CompletedTask
    }

    func RefreshAsync(cancellationToken CancellationToken = default(CancellationToken)) Task {
        cancellationToken.ThrowIfCancellationRequested()
        return Task.CompletedTask
    }

    func Seed(item LibraryItem) -> items.Add(item)
}
