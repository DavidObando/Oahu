// G# port of src/Oahu.Cli.App/Queue/JsonFileQueueService.cs.
// `lock` and `using` aren't supported in G# 0.1.516; we use Monitor.Enter/Exit
// and explicit Dispose() calls. `string.X` (lowercase) doesn't resolve either —
// use capital `String` for static helpers.

package Oahu.Cli.App.Experiment.Queue

import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App
import Oahu.Cli.App.Models

type ExpJsonFileQueueService class : IExpQueueService {
    FilePath string = ""
    writeLock object = Object()

    func lockPath() string {
        return FilePath + ".lock"
    }

    func acquire() FileStream {
        var lp = lockPath()
        var dir = Path.GetDirectoryName(lp)
        if !String.IsNullOrEmpty(dir) {
            Directory.CreateDirectory(dir!!)
        }
        return FileStream(lp, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None)
    }

    func loadLocked() List[QueueEntry] {
        let loaded = AtomicFile.ReadJson[List[QueueEntry]](FilePath, nil)
        return loaded ?: List[QueueEntry]()
    }

    func persist(list List[QueueEntry]) {
        AtomicFile.WriteAllJson[List[QueueEntry]](FilePath, list, nil)
    }

    func Path() string {
        return FilePath
    }

    func ListAsync(ct CancellationToken) Task[IReadOnlyList[QueueEntry]] {
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(writeLock)
        var fs = acquire()
        var snap = loadLocked().ToArray()
        fs.Dispose()
        Monitor.Exit(writeLock)
        return Task.FromResult[IReadOnlyList[QueueEntry]](snap)
    }

    func AddAsync(entry QueueEntry, ct CancellationToken) Task[bool] {
        if entry == nil {
            return Task.FromException[bool](ArgumentNullException("entry"))
        }
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(writeLock)
        var fs = acquire()
        var list = loadLocked()
        var exists = false
        for e in list {
            if String.Equals(e.Asin, entry.Asin, StringComparison.OrdinalIgnoreCase) {
                exists = true
            }
        }
        if !exists {
            list.Add(entry)
            persist(list)
        }
        fs.Dispose()
        Monitor.Exit(writeLock)
        return Task.FromResult(!exists)
    }

    func RemoveAsync(asin string, ct CancellationToken) Task[bool] {
        if String.IsNullOrWhiteSpace(asin) {
            return Task.FromException[bool](ArgumentException("asin must not be empty"))
        }
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(writeLock)
        var fs = acquire()
        var list = loadLocked()
        var idx = findIndex(list, asin)
        var ok = false
        if idx >= 0 {
            list.RemoveAt(idx)
            persist(list)
            ok = true
        }
        fs.Dispose()
        Monitor.Exit(writeLock)
        return Task.FromResult(ok)
    }

    func MoveAsync(asin string, delta int32, ct CancellationToken) Task[bool] {
        if String.IsNullOrWhiteSpace(asin) {
            return Task.FromException[bool](ArgumentException("asin must not be empty"))
        }
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(writeLock)
        var fs = acquire()
        var list = loadLocked()
        var idx = findIndex(list, asin)
        var moved = false
        if idx >= 0 {
            var target = idx + delta
            if target >= 0 && target < list.Count && target != idx {
                var a = list[idx]
                var b = list[target]
                list[idx] = b
                list[target] = a
                persist(list)
                moved = true
            }
        }
        fs.Dispose()
        Monitor.Exit(writeLock)
        return Task.FromResult(moved)
    }

    func ClearAsync(ct CancellationToken) Task {
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(writeLock)
        var fs = acquire()
        persist(List[QueueEntry]())
        fs.Dispose()
        Monitor.Exit(writeLock)
        return Task.CompletedTask
    }

    func findIndex(list List[QueueEntry], asin string) int32 {
        var i = 0
        for e in list {
            if String.Equals(e.Asin, asin, StringComparison.OrdinalIgnoreCase) {
                return i
            }
            i = i + 1
        }
        return -1
    }
}
