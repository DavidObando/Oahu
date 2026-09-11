package Oahu.Cli.App.Jobs

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli.App
import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Runtime.CompilerServices
import System.Text.Json
import System.Threading
import System.Threading.Tasks
import SystemObject = System.Object

/// Append-only JSONL history store. Records are written one-per-line so a partial
/// record on crash can be skipped without corrupting the rest of the file.
class JsonlHistoryStore {
    private let path string
    private let writeLock object = SystemObject()
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
        lock writeLock {
            let dir = Path.GetDirectoryName(path)
            if !string.IsNullOrEmpty(dir) {
                Directory.CreateDirectory(dir)
            }
            using let stream = FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read)
            using let writer = StreamWriter(stream)
            writer.WriteLine(JsonSerializer.Serialize(record, options))
            writer.Flush()
            stream.Flush(flushToDisk: true)
        }
    }

    async func ReadAllAsync(
        @EnumeratorCancellation cancellationToken CancellationToken = default(CancellationToken)
    ) IAsyncEnumerable[JobRecord] {
        if !File.Exists(path) {
            yield break
        }
        using let reader = StreamReader(
            FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)
        )
        var lineNumber = 0
        while true {
            cancellationToken.ThrowIfCancellationRequested()
            let line string? = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false)
            if line == nil {
                yield break
            }
            lineNumber++
            if string.IsNullOrWhiteSpace(line) {
                continue
            }
            var rec JobRecord? = nil
            try {
                rec = JsonSerializer.Deserialize[JobRecord](line, options)
            } catch (ex JsonException) {
                // Skip torn records; the design's "append-only" guarantee tolerates a single torn tail line.
                // Still surface the issue so operators can detect repeated corruption.
                logger.LogWarning(
                    ex,
                    "Skipping malformed history record at {Path}:{LineNumber}: {Reason}",
                    path,
                    lineNumber,
                    ex.Message
                )
            }
            if rec != nil {
                yield rec
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
        lock writeLock {
            let dir = Path.GetDirectoryName(path)
            if !string.IsNullOrEmpty(dir) {
                Directory.CreateDirectory(dir)
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
        }
        return all.Count - kept.Count
    }
}
