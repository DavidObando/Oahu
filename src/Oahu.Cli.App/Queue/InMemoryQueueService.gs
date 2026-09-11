package Oahu.Cli.App.Queue

import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import SystemObject = System.Object

/// Thread-safe in-memory queue. Used by the test suite and by short-lived
/// scenarios that don't need cross-invocation persistence (e.g. `oahu-cli serve`
/// can be configured to keep its queue purely in-memory).
class InMemoryQueueService : IQueueService {
    private let $lock object = SystemObject()
    private let entries List[QueueEntry] = List[QueueEntry]()

    func ListAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[IReadOnlyList[QueueEntry]] {
        cancellationToken.ThrowIfCancellationRequested()
        lock $lock {
            return Task.FromResult[IReadOnlyList[QueueEntry]](entries.ToArray())
        }
    }

    func AddAsync(entry QueueEntry, cancellationToken CancellationToken = default(CancellationToken)) Task[bool] {
        ArgumentNullException.ThrowIfNull(entry)
        cancellationToken.ThrowIfCancellationRequested()
        lock $lock {
            if entries.Any((e QueueEntry) -> string.Equals(e.Asin, entry.Asin, StringComparison.OrdinalIgnoreCase)) {
                return Task.FromResult(false)
            }
            entries.Add(entry)
            return Task.FromResult(true)
        }
    }

    func RemoveAsync(asin string, cancellationToken CancellationToken = default(CancellationToken)) Task[bool] {
        ArgumentException.ThrowIfNullOrWhiteSpace(asin)
        cancellationToken.ThrowIfCancellationRequested()
        lock $lock {
            let removed = entries.RemoveAll(
                (e QueueEntry) -> string.Equals(e.Asin, asin, StringComparison.OrdinalIgnoreCase)
            )
            return Task.FromResult(removed > 0)
        }
    }

    func MoveAsync(asin string, delta int32, cancellationToken CancellationToken = default(CancellationToken)) Task[
        bool
    ] {
        ArgumentException.ThrowIfNullOrWhiteSpace(asin)
        cancellationToken.ThrowIfCancellationRequested()
        lock $lock {
            let idx = entries.FindIndex(
                (e QueueEntry) -> string.Equals(e.Asin, asin, StringComparison.OrdinalIgnoreCase)
            )
            if idx < 0 {
                return Task.FromResult(false)
            }
            let target = idx + delta
            if target < 0 || target >= entries.Count || target == idx {
                return Task.FromResult(false)
            }
            entries[idx], entries[target] = entries[target], entries[idx]
            return Task.FromResult(true)
        }
    }

    func ClearAsync(cancellationToken CancellationToken = default(CancellationToken)) Task {
        cancellationToken.ThrowIfCancellationRequested()
        lock $lock {
            entries.Clear()
        }
        return Task.CompletedTask
    }
}
