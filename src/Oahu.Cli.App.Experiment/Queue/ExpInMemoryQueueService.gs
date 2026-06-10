// G# port of src/Oahu.Cli.App/Queue/InMemoryQueueService.cs.
// G# 0.1.516 has no `lock` statement; we use Monitor.Enter/Exit with try/finally.
// `string.X` (lowercase static call) is not recognised — use capital `String`.

package Oahu.Cli.App.Experiment.Queue

import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Models

type ExpInMemoryQueueService class : IExpQueueService {
    syncRoot object = Object()
    entries List[QueueEntry] = List[QueueEntry]()

    func ListAsync(ct CancellationToken) Task[IReadOnlyList[QueueEntry]] {
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(syncRoot)
        var result = Task.FromResult[IReadOnlyList[QueueEntry]](entries.ToArray())
        Monitor.Exit(syncRoot)
        return result
    }

    func AddAsync(entry QueueEntry, ct CancellationToken) Task[bool] {
        if entry == nil {
            return Task.FromException[bool](ArgumentNullException("entry"))
        }
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(syncRoot)
        var exists = false
        for e in entries {
            if String.Equals(e.Asin, entry.Asin, StringComparison.OrdinalIgnoreCase) {
                exists = true
            }
        }
        if !exists {
            entries.Add(entry)
        }
        Monitor.Exit(syncRoot)
        return Task.FromResult(!exists)
    }

    func RemoveAsync(asin string, ct CancellationToken) Task[bool] {
        if String.IsNullOrWhiteSpace(asin) {
            return Task.FromException[bool](ArgumentException("asin must not be empty"))
        }
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(syncRoot)
        var idx = findIndex(asin)
        var ok = false
        if idx >= 0 {
            entries.RemoveAt(idx)
            ok = true
        }
        Monitor.Exit(syncRoot)
        return Task.FromResult(ok)
    }

    func MoveAsync(asin string, delta int32, ct CancellationToken) Task[bool] {
        if String.IsNullOrWhiteSpace(asin) {
            return Task.FromException[bool](ArgumentException("asin must not be empty"))
        }
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(syncRoot)
        var idx = findIndex(asin)
        var moved = false
        if idx >= 0 {
            var target = idx + delta
            if target >= 0 && target < entries.Count && target != idx {
                var lst = entries
                var a = lst[idx]
                var b = lst[target]
                lst[idx] = b
                lst[target] = a
                moved = true
            }
        }
        Monitor.Exit(syncRoot)
        return Task.FromResult(moved)
    }

    func ClearAsync(ct CancellationToken) Task {
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(syncRoot)
        entries.Clear()
        Monitor.Exit(syncRoot)
        return Task.CompletedTask
    }

    func findIndex(asin string) int32 {
        var i = 0
        for e in entries {
            if String.Equals(e.Asin, asin, StringComparison.OrdinalIgnoreCase) {
                return i
            }
            i = i + 1
        }
        return -1
    }
}
