package Oahu.Cli.Server.Audit

import Oahu.Cli.App.Paths
import System
import System.Collections.Generic
import System.Globalization
import System.IO
import System.Security.Cryptography
import System.Text
import System.Text.Json
import System.Threading
import SystemObject = System.Object

/// Append-only audit log at `<SharedUserDataDir>/logs/server-audit.jsonl`.
///
/// One line per tool invocation; the line shape is:
/// ```
/// {
/// "ts": "2026-01-…Z",
/// "transport": "stdio" | "http",
/// "principal": "stdio" | "http:<tokenPrefix>",
/// "tool": "library_list",
/// "argsHash": "<sha256-hex of canonicalized args>",
/// "outcome": "ok" | "denied" | "error",
/// "latencyMs": 12
/// }
/// ```
///
/// Args are <i>hashed</i> (SHA-256 of the JSON-canonical form), never logged in the clear,
/// so book titles / ASINs / config values do not leak into the audit trail.
///
/// Failure to write is best-effort and never propagates: a hung disk must not crash
/// the server.
class AuditLog {
    private let path string
    private var consecutiveFailures int32

    init(path string? = nil) {
        this.path = path ?? Path.Combine(CliPaths.SharedUserDataDir, "logs", "server-audit.jsonl")
    }

    prop Path string -> path

    func Write(
        transport string,
        principal string,
        tool string,
        args IReadOnlyDictionary[string, object?]?,
        outcome string,
        latencyMs int64
    ) {
        try {
            let dir = Path.GetDirectoryName(path)!!
            Directory.CreateDirectory(dir)
            let entry = Dictionary[string, object?](StringComparer.Ordinal){
                ["ts"] = DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture),
                ["transport"] = transport,
                ["principal"] = principal,
                ["tool"] = tool,
                ["argsHash"] = HashArgs(args),
                ["outcome"] = outcome,
                ["latencyMs"] = latencyMs
            }
            let line = JsonSerializer.Serialize(entry)
            lock Sync {
                {
                    using let fs = FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read)
                    {
                        using let sw = StreamWriter(fs, Encoding.UTF8)
                        sw.WriteLine(line)
                        sw.Flush()
                        fs.Flush(flushToDisk: true)
                    }
                }
                Interlocked.Exchange(&consecutiveFailures, 0)
            }
        } catch (ex Exception) {
            // Best-effort but surface persistent failures so a wedged disk doesn't go unnoticed.
            let n = Interlocked.Increment(&consecutiveFailures)
            if n == FailureWarnThreshold || (n > FailureWarnThreshold && n % 50 == 0) {
                try {
                    Console.Error.WriteLine(
                        "[oahu-cli audit] $n consecutive write failures to $path: ${ex.GetType().Name}: ${ex.Message}"
                    )
                } catch {
                    // stderr unavailable — give up silently.

                }
            }
        }
    }

    shared {
        private const FailureWarnThreshold int32 = 5
        private let Sync object = SystemObject()

        func HashArgs(args IReadOnlyDictionary[string, object?]?) string {
            if args == nil || args.Count == 0 {
                return "sha256:" + Convert.ToHexString(SHA256.HashData(Array.Empty[uint8]())).ToLowerInvariant()
            }
            // Canonicalize: sort keys, serialize values via JsonSerializer with default options.
            let sorted = SortedDictionary[string, object?](StringComparer.Ordinal)
            for kvp in args {
                sorted[kvp.Key] = kvp.Value
            }
            let json = JsonSerializer.Serialize(sorted)
            return "sha256:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant()
        }
    }
}
