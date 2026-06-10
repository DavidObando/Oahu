// G# port of src/Oahu.Cli.App/Jobs/JsonlHistoryStore.cs.
// Append-only JSONL history store. Sync ReadAll/Delete only; the C# async
// IAsyncEnumerable variant is omitted to dodge gsharp#655 iterator
// field-capture risk. The field is named FilePath (not Path) to avoid
// shadowing the System.IO.Path type at call sites.

package Oahu.Cli.App.Experiment.Jobs

import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text.Json
import System.Threading
import Oahu.Cli.App.Models

type ExpJsonlHistoryStore class {
    FilePath string = ""
    writeLock object = Object()
    optsCached JsonSerializerOptions? = nil

    func options() JsonSerializerOptions {
        var cached = optsCached
        if cached != nil {
            return cached!!
        }
        let o = JsonSerializerOptions() {
            WriteIndented = false,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            AllowTrailingCommas = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
        }
        optsCached = o
        return o
    }

    func Append(record JobRecord) {
        if record == nil {
            throw ArgumentNullException("record")
        }
        let l = writeLock
        Monitor.Enter(l)
        try {
            let dir = Path.GetDirectoryName(FilePath)
            if !String.IsNullOrEmpty(dir) {
                Directory.CreateDirectory(dir!!)
            }
            let stream = FileStream(FilePath, FileMode.Append, FileAccess.Write, FileShare.Read)
            try {
                let writer = StreamWriter(stream)
                try {
                    writer.WriteLine(JsonSerializer.Serialize[JobRecord](record, options()))
                    writer.Flush()
                    stream.Flush(true)
                } finally {
                    writer.Dispose()
                }
            } finally {
                stream.Dispose()
            }
        } finally {
            Monitor.Exit(l)
        }
    }

    func ReadAll() List[JobRecord] {
        let list = List[JobRecord]()
        if !File.Exists(FilePath) {
            return list
        }
        let stream = FileStream(FilePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)
        try {
            let reader = StreamReader(stream)
            try {
                var line = reader.ReadLine()
                for line != nil {
                    if !String.IsNullOrWhiteSpace(line) {
                        try {
                            let rec = JsonSerializer.Deserialize[JobRecord](line!!, options())
                            if rec != nil {
                                list.Add(rec!!)
                            }
                        } catch (ex JsonException) {
                            // Skip torn records.
                        }
                    }
                    line = reader.ReadLine()
                }
            } finally {
                reader.Dispose()
            }
        } finally {
            stream.Dispose()
        }
        return list
    }

    // Sync flavor of DeleteAsync. Returns count of removed records.
    // asins/before/keep are all optional (nil/no-value means "no filter").
    func Delete(asins IReadOnlyCollection[string]?, before Nullable[DateTimeOffset], keep Nullable[int32]) int32 {
        if !File.Exists(FilePath) {
            return 0
        }

        var asinSet HashSet[string]? = nil
        if asins != nil {
            let a = asins!!
            if a.Count > 0 {
                asinSet = HashSet[string](a, StringComparer.OrdinalIgnoreCase)
            }
        }

        let all = ReadAll()
        let kept = List[JobRecord]()
        for rec in all {
            var matchesAsin = false
            if asinSet != nil {
                matchesAsin = asinSet!!.Contains(rec.Asin)
            }
            var matchesBefore = false
            if before.HasValue {
                matchesBefore = rec.CompletedAt < before.Value
            }
            if matchesAsin || matchesBefore {
                continue
            }
            kept.Add(rec)
        }

        var final = kept
        if keep.HasValue && kept.Count > keep.Value {
            let n = keep.Value
            let sorted = Enumerable.OrderByDescending[JobRecord, DateTimeOffset](
                kept, func(r JobRecord) DateTimeOffset { return r.CompletedAt })
            let taken = Enumerable.Take[JobRecord](sorted, n)
            let ascending = Enumerable.OrderBy[JobRecord, DateTimeOffset](
                taken, func(r JobRecord) DateTimeOffset { return r.CompletedAt })
            final = Enumerable.ToList[JobRecord](ascending)
        }

        let l = writeLock
        Monitor.Enter(l)
        try {
            let dir = Path.GetDirectoryName(FilePath)
            if !String.IsNullOrEmpty(dir) {
                Directory.CreateDirectory(dir!!)
            }
            let tmp = FilePath + ".tmp." + Guid.NewGuid().ToString("n")
            let fs = FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None)
            try {
                let writer = StreamWriter(fs)
                try {
                    for rec in final {
                        writer.WriteLine(JsonSerializer.Serialize[JobRecord](rec, options()))
                    }
                    writer.Flush()
                    fs.Flush(true)
                } finally {
                    writer.Dispose()
                }
            } finally {
                fs.Dispose()
            }
            File.Move(tmp, FilePath, true)
        } finally {
            Monitor.Exit(l)
        }

        return all.Count - final.Count
    }
}
