package Oahu.Cli.App

import System
import System.IO
import System.Text.Json

/// Helpers for serialising files atomically: write to a sibling `.tmp`,
/// flush to disk, then move-overwrite onto the destination. The move on POSIX
/// (rename(2)) and on Windows (MoveFileEx with REPLACE_EXISTING) is atomic at
/// the directory-entry level, so a crash either leaves the old file untouched
/// or the new file fully present.
class AtomicFile {
    shared {
        let DefaultJsonOptions JsonSerializerOptions = JsonSerializerOptions{
            WriteIndented: true,
            PropertyNamingPolicy: JsonNamingPolicy.CamelCase,
            AllowTrailingCommas: true,
            ReadCommentHandling: JsonCommentHandling.Skip
        }

        /// Serialise [`value`](paramref) as JSON to [`path`](paramref) atomically.
        func WriteAllJson[T](path string, value T, options JsonSerializerOptions? = nil) {
            let dir = Path.GetDirectoryName(path)
            if !string.IsNullOrEmpty(dir) {
                Directory.CreateDirectory(dir)
            }
            // Use a unique temp file per write so two concurrent writers (within or across processes)
            // don't clobber each other's staging file before the rename promotes it.
            let tmp = "$path.${Guid.NewGuid():N}.tmp"
            try {
                // Write + flush(true): fsync the file's bytes so the rename does not promote a partially written file.
                {
                    using let stream = FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None)
                    JsonSerializer.Serialize(stream, value, options ?? DefaultJsonOptions)
                    stream.Flush(flushToDisk: true)
                }
                File.Move(tmp, path, overwrite: true)
            } catch {
                // Clean up the staging file on any failure so we don't leak partial files.
                try {
                    if File.Exists(tmp) {
                        File.Delete(tmp)
                    }
                } catch {
                    // best-effort cleanup

                }
                rethrow
            }
        }

        /// Read JSON from [`path`](paramref), returning `default` if the file does not exist.
        func ReadJson[T](path string, options JsonSerializerOptions? = nil) T? {
            if !File.Exists(path) {
                return default(T?)
            }
            using let stream = File.OpenRead(path)
            return JsonSerializer.Deserialize[T](stream, options ?? DefaultJsonOptions)
        }
    }
}
