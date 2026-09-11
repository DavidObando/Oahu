package Oahu.Cli.App.Queue

import Oahu.Cli.App
import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks
import SystemObject = System.Object

/// JSON-file-backed queue, atomically rewritten on every mutation. Lives in
/// `SharedUserDataDir/queue.json` so the future GUI sees the same queue
/// without a migration (per design §11). Concurrent CLI invocations serialise
/// via an in-process monitor and a sibling lockfile (`queue.json.lock`)
/// held with (cref:FileShare.None) for the duration of each
/// read-modify-write so that two concurrently invoked `oahu-cli`
/// processes do not lose updates.
class JsonFileQueueService : IQueueService {
    private let path string
    private let lockPath string
    private let writeLock object = SystemObject()

    init(path string) {
        this.path = path
        lockPath = path + ".lock"
    }

    prop Path string -> path

    func ListAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[IReadOnlyList[QueueEntry]] {
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult[IReadOnlyList[QueueEntry]](WithLock(() -> LoadLocked().ToArray()))
    }

    func AddAsync(entry QueueEntry, cancellationToken CancellationToken = default(CancellationToken)) Task[bool] {
        ArgumentNullException.ThrowIfNull(entry)
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult(
            WithLock(
                () -> {
                    let list = LoadLocked()
                    if list.Any(
                        (e QueueEntry) -> string.Equals(e.Asin, entry.Asin, StringComparison.OrdinalIgnoreCase)
                    ) {
                        return false
                    }
                    list.Add(entry)
                    Persist(list)
                    return true
                }
            )
        )
    }

    func RemoveAsync(asin string, cancellationToken CancellationToken = default(CancellationToken)) Task[bool] {
        ArgumentException.ThrowIfNullOrWhiteSpace(asin)
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult(
            WithLock(
                () -> {
                    let list = LoadLocked()
                    let removed = list.RemoveAll(
                        (e QueueEntry) -> string.Equals(e.Asin, asin, StringComparison.OrdinalIgnoreCase)
                    )
                    if removed == 0 {
                        return false
                    }
                    Persist(list)
                    return true
                }
            )
        )
    }

    func MoveAsync(asin string, delta int32, cancellationToken CancellationToken = default(CancellationToken)) Task[
        bool
    ] {
        ArgumentException.ThrowIfNullOrWhiteSpace(asin)
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult(
            WithLock(
                () -> {
                    let list = LoadLocked()
                    let idx = list.FindIndex(
                        (e QueueEntry) -> string.Equals(e.Asin, asin, StringComparison.OrdinalIgnoreCase)
                    )
                    if idx < 0 {
                        return false
                    }
                    let target = idx + delta
                    if target < 0 || target >= list.Count {
                        return false
                    }
                    if target == idx {
                        return false
                    }
                    list[idx], list[target] = list[target], list[idx]
                    Persist(list)
                    return true
                }
            )
        )
    }

    func ClearAsync(cancellationToken CancellationToken = default(CancellationToken)) Task {
        cancellationToken.ThrowIfCancellationRequested()
        WithLock(
            () -> {
                Persist(List[QueueEntry]())
                return 0
            }
        )
        return Task.CompletedTask
    }

    private func LoadLocked() List[QueueEntry] {
        let loaded = AtomicFile.ReadJson[List[QueueEntry]](path)
        return loaded ?? List[QueueEntry]()
    }

    private func Persist(list List[QueueEntry]) -> AtomicFile.WriteAllJson(path, list)

    private func WithLock[T](body() -> T) T {
        lock writeLock {
            let dir = Path.GetDirectoryName(lockPath)
            if !string.IsNullOrEmpty(dir) {
                Directory.CreateDirectory(dir)
            }
            // Cross-process exclusion: only one CLI invocation can hold this fd at a time.
            // FileShare.None requests an exclusive open; on Windows that is enforced for
            // every process, on macOS/Linux it serialises mutating CLI invocations against
            // each other in practice (see design §11, single-writer assumption). The handle
            // is released as soon as the using-block exits — no stale lock files survive.
            using let lockStream = FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None)
            return body()
        }
    }
}
