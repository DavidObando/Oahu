// G# port of src/Oahu.Cli.App/Library/{ILibraryService.cs,FakeLibraryService.cs}.
// Workarounds applied (against G# 0.1.516):
//   * gsharp#666 — LINQ instance-syntax extensions on IEnumerable<CLR-ref> fail,
//     so we use `Enumerable.Where[LibraryItem](src, pred)` static form.

package Oahu.Cli.App.Experiment.Library

import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Models

type LibraryFilter class {
    Search string?
    Author string?
    Series string?
    AvailableOnly bool = true
}

type ILibraryService interface {
    func ListAsync(filter LibraryFilter?, cancellationToken CancellationToken) Task[IReadOnlyList[LibraryItem]]
    func GetAsync(asin string, cancellationToken CancellationToken) Task[LibraryItem?]
    func SyncAsync(profileAlias string, cancellationToken CancellationToken) Task[int32]
    func EnsureFreshAsync(cancellationToken CancellationToken) Task
    func RefreshAsync(cancellationToken CancellationToken) Task
}

type FakeLibraryService class : ILibraryService {
    items List[LibraryItem]

    func init(seed IEnumerable[LibraryItem]?) {
        items = seed != nil ? List[LibraryItem](seed!!) : List[LibraryItem]()
    }

    func ListAsync(filter LibraryFilter?, cancellationToken CancellationToken) Task[IReadOnlyList[LibraryItem]] {
        cancellationToken.ThrowIfCancellationRequested()
        let f = filter ?: LibraryFilter()

        var q IEnumerable[LibraryItem] = items
        if f.AvailableOnly {
            q = Enumerable.Where[LibraryItem](q, func(i LibraryItem) bool { return i.IsAvailable })
        }
        if !String.IsNullOrWhiteSpace(f.Search) {
            let search = f.Search!!
            q = Enumerable.Where[LibraryItem](q, func(i LibraryItem) bool {
                return i.Title.Contains(search, StringComparison.OrdinalIgnoreCase)
            })
        }
        if !String.IsNullOrWhiteSpace(f.Author) {
            let author = f.Author!!
            q = Enumerable.Where[LibraryItem](q, func(i LibraryItem) bool {
                return Enumerable.Any[string](i.Authors, func(a string) bool {
                    return a.Contains(author, StringComparison.OrdinalIgnoreCase)
                })
            })
        }
        if !String.IsNullOrWhiteSpace(f.Series) {
            let series = f.Series!!
            q = Enumerable.Where[LibraryItem](q, func(i LibraryItem) bool {
                return String.Equals(i.Series, series, StringComparison.OrdinalIgnoreCase)
            })
        }
        let arr = Enumerable.ToArray[LibraryItem](q)
        return Task.FromResult[IReadOnlyList[LibraryItem]](arr)
    }

    func GetAsync(asin string, cancellationToken CancellationToken) Task[LibraryItem?] {
        ArgumentException.ThrowIfNullOrWhiteSpace(asin)
        cancellationToken.ThrowIfCancellationRequested()
        let match = Enumerable.FirstOrDefault[LibraryItem](items, func(i LibraryItem) bool {
            return String.Equals(i.Asin, asin, StringComparison.OrdinalIgnoreCase)
        })
        return Task.FromResult[LibraryItem?](match)
    }

    func SyncAsync(profileAlias string, cancellationToken CancellationToken) Task[int32] {
        ArgumentException.ThrowIfNullOrWhiteSpace(profileAlias)
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult[int32](items.Count)
    }

    func EnsureFreshAsync(cancellationToken CancellationToken) Task {
        cancellationToken.ThrowIfCancellationRequested()
        return Task.CompletedTask
    }

    func RefreshAsync(cancellationToken CancellationToken) Task {
        cancellationToken.ThrowIfCancellationRequested()
        return Task.CompletedTask
    }

    func Seed(item LibraryItem) {
        items.Add(item)
    }
}
