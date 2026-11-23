package Oahu.Cli.App.Jobs

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli.App
import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text.Json
import System.Threading
import System.Threading.Tasks

/// Append-only JSONL history store. Records are written one-per-line so a partial
/// record on crash can be skipped without corrupting the rest of the file.
class JsonlHistoryStore {
    private let path string
    private let options JsonSerializerOptions
    private let logger ILogger

    init(path string, logger ILogger[JsonlHistoryStore]? = nil) {
        this.path = path
        this.logger = logger ?? NullLogger[JsonlHistoryStore].Instance
        options = JsonSerializerOptions(AtomicFile.DefaultJsonOptions){WriteIndented = false}
    }

    prop Path string -> path

    func Append(record JobRecord) {
        ArgumentNullException.ThrowIfNull(record)
        using let mutationLock = AcquireMutationLockAsync(CancellationToken.None).GetAwaiter().GetResult()
        using let stream = FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read)
        using let writer = StreamWriter(stream)
        writer.WriteLine(JsonSerializer.Serialize(record, options))
        writer.Flush()
        stream.Flush(flushToDisk: true)
    }

    func ReadAllAsync(
        cancellationToken CancellationToken = default(CancellationToken)
    ) IAsyncEnumerable[JobRecord] -> HistoryEnumerable(this, cancellationToken)

    private func ParseRecord(line string, lineNumber int32) JobRecord? {
        try {
            return JsonSerializer.Deserialize[JobRecord](line, options)
        } catch (ex JsonException) {
            // Skip torn records, but surface repeated corruption to operators.
            logger.LogWarning(
                ex,
                "Skipping malformed history record at {Path}:{LineNumber}: {Reason}",
                path,
                lineNumber,
                ex.Message
            )
            return nil
        }
    }

    private class HistoryEnumerable : IAsyncEnumerable[JobRecord] {
        private let store JsonlHistoryStore
        private let cancellationToken CancellationToken

        init(store JsonlHistoryStore, cancellationToken CancellationToken) {
            this.store = store
            this.cancellationToken = cancellationToken
        }

        func GetAsyncEnumerator(cancellationToken CancellationToken = default(CancellationToken)) IAsyncEnumerator[JobRecord] ->
            HistoryEnumerator(store, this.cancellationToken, cancellationToken)
    }

    // Explicit ownership avoids generated iterator cleanup racing a resumed MoveNextAsync.
    private class HistoryEnumerator : IAsyncEnumerator[JobRecord] {
        private let store JsonlHistoryStore
        private let cancellationToken CancellationToken
        private let linkedCancellation CancellationTokenSource?
        private var reader StreamReader?
        private var current JobRecord?
        private var lineNumber int32 = 0
        private var started bool = false
        private var finished bool = false

        init(store JsonlHistoryStore, initialToken CancellationToken, enumeratorToken CancellationToken) {
            this.store = store
            if !initialToken.CanBeCanceled {
                cancellationToken = enumeratorToken
            } else if !enumeratorToken.CanBeCanceled || initialToken == enumeratorToken {
                cancellationToken = initialToken
            } else {
                let linked = CancellationTokenSource.CreateLinkedTokenSource(initialToken, enumeratorToken)
                linkedCancellation = linked
                cancellationToken = linked.Token
            }
        }

        prop Current JobRecord -> current!!

        func MoveNextAsync() ValueTask[bool] -> ValueTask[bool](ReadNextAsync())

        private async func ReadNextAsync() bool {
            if finished { return false }
            try {
                if !started {
                    started = true
                    if !File.Exists(store.path) {
                        Complete()
                        return false
                    }
                    reader = StreamReader(
                        FileStream(store.path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)
                    )
                }
                while true {
                    cancellationToken.ThrowIfCancellationRequested()
                    let line string? = await reader!!.ReadLineAsync(cancellationToken).ConfigureAwait(false)
                    if line == nil {
                        Complete()
                        return false
                    }
                    lineNumber++
                    if string.IsNullOrWhiteSpace(line) { continue }
                    let record = store.ParseRecord(line, lineNumber)
                    if record != nil {
                        current = record
                        return true
                    }
                }
            } catch {
                Complete()
                rethrow
            }
        }

        func DisposeAsync() ValueTask {
            Complete()
            return default(ValueTask)
        }

        private func Complete() {
            if finished { return }
            finished = true
            try {
                reader?.Dispose()
            } finally {
                linkedCancellation?.Dispose()
            }
        }
    }

    /// Deletes history records that match any of the supplied filters,
    /// rewriting the file atomically. Records are KEPT iff:
    /// - their ASIN is NOT in [`asins`](paramref) (when non-empty), AND
    /// - their `CompletedAt` is NOT before [`before`](paramref) (when set), AND
    /// - they fall within the most recent [`keep`](paramref) records overall
    /// (when set). The [`keep`](paramref) filter is applied last.
    /// Returns the number of deleted records.
    async func DeleteAsync(
        asins IReadOnlyCollection[string]? = nil,
        before DateTimeOffset? = nil,
        keep int32? = nil,
        cancellationToken CancellationToken = default(CancellationToken)
    ) int32 {
        using let mutationLock = await AcquireMutationLockAsync(cancellationToken).ConfigureAwait(false)
        if !File.Exists(path) {
            return 0
        }
        let asinSet HashSet[string]? = if asins != nil && asins.Count > 0 {
            HashSet[string](asins, StringComparer.OrdinalIgnoreCase)
        } else {
            default(HashSet[string]?)
        }
        let all = List[JobRecord]()
        await for rec in ReadAllAsync(cancellationToken).ConfigureAwait(false) {
            all.Add(rec)
        }
        var kept = List[JobRecord](all.Count)
        for rec in all {
            let matchesAsin = asinSet != nil && asinSet.Contains(rec.Asin)
            let matchesBefore = before is {} b && rec.CompletedAt < b
            if matchesAsin || matchesBefore {
                continue
            }
            kept.Add(rec)
        }
        if keep is {} n && kept.Count > n {
            kept = kept
                .OrderByDescending((r JobRecord) -> r.CompletedAt)
                .Take(n)
                .OrderBy((r JobRecord) -> r.CompletedAt)
                .ToList()
        }
        let tmp = path + ".tmp." + Guid.NewGuid().ToString("n")
        {
            using let fs = FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None)
            {
                using let writer = StreamWriter(fs)
                for rec in kept {
                    writer.WriteLine(JsonSerializer.Serialize(rec, options))
                }
                writer.Flush()
                fs.Flush(flushToDisk: true)
            }
        }
        File.Move(tmp, path, overwrite: true)
        return all.Count - kept.Count
    }

    private async func AcquireMutationLockAsync(cancellationToken CancellationToken) FileStream {
        let lockPath = System.IO.Path.GetFullPath(path) + ".lock"
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(lockPath)!!)
        while true {
            cancellationToken.ThrowIfCancellationRequested()
            try {
                // Keep the lock inode stable so other instances/processes share the same lease.
                return FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None)
            } catch (ex IOException) when (
                (OperatingSystem.IsWindows() && (ex.HResult & 0xffff) == 32) ||
                (OperatingSystem.IsMacOS() && ex.HResult == 35) ||
                (OperatingSystem.IsLinux() && ex.HResult == 11)
            ) {
                // Windows sharing violation; Unix EAGAIN (Darwin 35, Linux 11).
                await Task.Delay(10, cancellationToken).ConfigureAwait(false)
            }
        }
    }
}
