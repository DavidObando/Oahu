package Oahu.Cli.App.Doctor

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.BooksDatabase
import Oahu.Cli.App.Paths
import Oahu.Decrypt
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Threading.Tasks

/// Diagnostics for encrypted audiobook files (.aaxc/.aax).
/// Checks file integrity, MPEG-4 structure, key resolution, and performs a
/// trial export to verify the decryption pipeline works end-to-end.
class FileDiagnosticService {
    private let logger ILogger

    init(logger ILogger? = nil) {
        this.logger = logger ?? NullLogger.Instance
    }

    /// Run file diagnostics. If [`attemptExport`](paramref) is true, performs
    /// a full decryption pass and writes to [`outputPath`](paramref).
    func Run(options FileDiagnosticOptions) DoctorReport {
        let checks = List[DoctorCheck]()
        // 1. File integrity
        let fileCheck = CheckFileIntegrity(options.FilePath)
        checks.Add(fileCheck)
        if fileCheck.Severity == DoctorSeverity.Error {
            return DoctorReport(checks)
        }
        // 2. MPEG-4 structure
        let structureCheck = CheckMpeg4Structure(options.FilePath)
        checks.Add(structureCheck)
        if structureCheck.Severity == DoctorSeverity.Error {
            return DoctorReport(checks)
        }
        // 3. Key resolution
        let (keyCheck, resolvedKey, resolvedIv) = ResolveKey(options)
        checks.Add(keyCheck)
        if keyCheck.Severity == DoctorSeverity.Error {
            return DoctorReport(checks)
        }
        // 4. Key validation (can it be applied to the file?)
        let keyValidation = CheckKeyAccepted(options.FilePath, resolvedKey!!, resolvedIv!!)
        checks.Add(keyValidation)
        if keyValidation.Severity == DoctorSeverity.Error {
            return DoctorReport(checks)
        }
        // 5. Export (if requested)
        if options.AttemptExport {
            let exportCheck = RunExport(options.FilePath, resolvedKey!!, resolvedIv!!, options.OutputPath)
            checks.Add(exportCheck)
        }
        return DoctorReport(checks)
    }

    private func ResolveKey(options FileDiagnosticOptions)(Check DoctorCheck, Key string?, Iv string?) {
        // If key/IV explicitly provided, validate format
        if !string.IsNullOrWhiteSpace(options.Key) && !string.IsNullOrWhiteSpace(options.Iv) {
            if options.Key!!.Length != 32 || !options.Key!!.All(char.IsAsciiHexDigit) {
                return (
                    DoctorCheck(
                        "key-resolve",
                        "Decryption key resolved",
                        DoctorSeverity.Error,
                        "Key must be 32 hex characters. Got ${options.Key!!.Length} chars."
                    ),
                    nil,
                    nil
                )
            }
            if options.Iv!!.Length != 32 || !options.Iv!!.All(char.IsAsciiHexDigit) {
                return (
                    DoctorCheck(
                        "key-resolve",
                        "Decryption key resolved",
                        DoctorSeverity.Error,
                        "IV must be 32 hex characters. Got ${options.Iv!!.Length} chars."
                    ),
                    nil,
                    nil
                )
            }
            return (
                DoctorCheck(
                    "key-resolve",
                    "Decryption key resolved",
                    DoctorSeverity.Ok,
                    "Key/IV provided via arguments. Key=${options.Key!![..8]}..."
                ),
                options.Key!!,
                options.Iv!!
            )
        }
        // Try database lookup
        let asin = options.Asin ?? ExtractAsinFromFilename(options.FilePath)
        if string.IsNullOrWhiteSpace(asin) {
            return (
                DoctorCheck(
                    "key-resolve",
                    "Decryption key resolved",
                    DoctorSeverity.Error,
                    "No key/IV provided and could not determine ASIN from filename.",
                    "Pass --key and --iv, or --asin to look up from the library database."
                ),
                nil,
                nil
            )
        }
        return LookupKeyFromDatabase(asin, options.DatabasePath)
    }

    private func LookupKeyFromDatabase(asin string, dbPath string?)(Check DoctorCheck, Key string?, Iv string?) {
        var dbPath = dbPath
        dbPath ??= FindDatabasePath()
        if dbPath == nil {
            return (
                DoctorCheck(
                    "key-resolve",
                    "Decryption key resolved",
                    DoctorSeverity.Error,
                    "Library database (audiobooks.db) not found.",
                    "Run `oahu-cli auth login` and sync your library, or pass --key and --iv manually."
                ),
                nil,
                nil
            )
        }
        try {
            let dbDir = Path.GetDirectoryName(dbPath)!!
            let dbFile = Path.GetFileName(dbPath)
            using let db = BookDbContext(dbDir, dbFile)
            let book Book? = db.Books.FirstOrDefault((b Book) -> b.Asin == asin)
            if book == nil {
                return (
                    DoctorCheck(
                        "key-resolve",
                        "Decryption key resolved",
                        DoctorSeverity.Error,
                        "ASIN '$asin' not found in library database.",
                        "Run `oahu-cli library sync` to refresh, or pass --key and --iv."
                    ),
                    nil,
                    nil
                )
            }
            let key = book.LicenseKey
            let iv = book.LicenseIv
            if string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv) {
                return (
                    DoctorCheck(
                        "key-resolve",
                        "Decryption key resolved",
                        DoctorSeverity.Error,
                        "ASIN '$asin' found but license key/IV are empty.",
                        "Run `oahu-cli download {asin}` to acquire the license."
                    ),
                    nil,
                    nil
                )
            }
            return (
                DoctorCheck(
                    "key-resolve",
                    "Decryption key resolved",
                    DoctorSeverity.Ok,
                    "Loaded from database for ASIN '$asin'. Key=${key!![..8]}..."
                ),
                key!!,
                iv!!
            )
        } catch (ex Exception) {
            return (
                DoctorCheck(
                    "key-resolve",
                    "Decryption key resolved",
                    DoctorSeverity.Error,
                    "Database query failed: ${ex.Message}",
                    "Ensure the database is not locked by another process."
                ),
                nil,
                nil
            )
        }
    }

    shared {
        private func CheckFileIntegrity(filePath string) DoctorCheck {
            if !File.Exists(filePath) {
                return DoctorCheck(
                    "file-exists",
                    "File exists and is readable",
                    DoctorSeverity.Error,
                    "File not found: $filePath",
                    "Check the file path. The download may have been moved or deleted."
                )
            }
            try {
                let info = FileInfo(filePath)
                if info.Length == int64(0) {
                    return DoctorCheck(
                        "file-exists",
                        "File exists and is readable",
                        DoctorSeverity.Error,
                        "File is empty (0 bytes): $filePath",
                        "Re-download the book."
                    )
                }
                // Quick read test
                using let fs = File.OpenRead(filePath)
                let buf = [8]uint8
                let read = fs.Read(buf, 0, 8)
                if read < 8 {
                    return DoctorCheck(
                        "file-exists",
                        "File exists and is readable",
                        DoctorSeverity.Error,
                        "File too small (${info.Length} bytes) — likely corrupt.",
                        "Re-download the book."
                    )
                }
                let sizeStr = if info.Length >= int64(1024 * 1024) {
                    "${float64(info.Length) / (1024.0 * float64(1024.0)):F1} MiB"
                } else {
                    "${float64(info.Length) / 1024.0:F1} KiB"
                }
                return DoctorCheck(
                    "file-exists",
                    "File exists and is readable",
                    DoctorSeverity.Ok,
                    "$sizeStr — ${Path.GetFileName(filePath)}"
                )
            } catch (ex Exception) {
                return DoctorCheck(
                    "file-exists",
                    "File exists and is readable",
                    DoctorSeverity.Error,
                    "Cannot read file: ${ex.Message}",
                    "Check file permissions."
                )
            }
        }

        private func CheckMpeg4Structure(filePath string) DoctorCheck {
            try {
                using let fs = File.OpenRead(filePath)
                using let aax = AaxFile(fs)
                let details = "Type=${aax.FileType}, Duration=${aax.Duration:hh\:mm\:ss}, " +
                    "Channels=${aax.AudioChannels}, SampleRate=${aax.TimeScale}Hz"
                return DoctorCheck("mpeg4-structure", "Valid MPEG-4 container", DoctorSeverity.Ok, details)
            } catch (ex Exception) {
                return DoctorCheck(
                    "mpeg4-structure",
                    "Valid MPEG-4 container",
                    DoctorSeverity.Error,
                    "Failed to parse: ${ex.GetType().Name}: ${ex.Message}",
                    "The file may be corrupt or truncated. Try re-downloading."
                )
            }
        }

        private func CheckKeyAccepted(filePath string, key string, iv string) DoctorCheck {
            try {
                using let fs = File.OpenRead(filePath)
                using let aax = AaxFile(fs)
                aax.SetDecryptionKey(key, iv)
                return DoctorCheck(
                    "key-validate",
                    "Decryption key accepted",
                    DoctorSeverity.Ok,
                    "Key/IV applied successfully to the file."
                )
            } catch (ex Exception) {
                return DoctorCheck(
                    "key-validate",
                    "Decryption key accepted",
                    DoctorSeverity.Error,
                    "Key rejected: ${ex.GetType().Name}: ${ex.Message}",
                    "The key/IV may not match this file. Try re-downloading the license."
                )
            }
        }

        private func RunExport(filePath string, key string, iv string, outputPath string?) DoctorCheck {
            // Run async export on thread pool to avoid deadlocking
            return Task
                .Run[DoctorCheck](
                func () Task[DoctorCheck]? {
                    return RunExportAsync(filePath, key, iv, outputPath)
                }
            )
                .GetAwaiter()
                .GetResult()
        }

        private async func RunExportAsync(filePath string, key string, iv string, outputPath string?) DoctorCheck {
            var outputPath = outputPath
            outputPath ??= Path.ChangeExtension(filePath, ".m4b")
            let outputDir = Path.GetDirectoryName(outputPath) ?? "."
            try {
                Directory.CreateDirectory(outputDir)
            } catch (ex Exception) {
                return DoctorCheck(
                    "file-export",
                    "Decryption export to M4B",
                    DoctorSeverity.Error,
                    "Cannot write to output directory: ${ex.Message}"
                )
            }
            var inputStream FileStream? = nil
            var aaxFile AaxFile? = nil
            try {
                inputStream = File.OpenRead(filePath)
                aaxFile = AaxFile(inputStream)
                aaxFile.SetDecryptionKey(key, iv)
                let sw = Stopwatch.StartNew()
                var lastProgress = TimeSpan.Zero
                var lastSpeed float64 = 0.0
                let outputStream = File.Create(outputPath!!)
                let operation = aaxFile.ConvertToMp4aAsync(outputStream)
                operation.ConversionProgressUpdate += (_ object?, e ConversionProgressEventArgs) -> {
                    lastProgress = e.ProcessPosition
                    lastSpeed = e.ProcessSpeed
                }
                try {
                    await operation
                } catch (OperationCanceledException) {
                    TryCleanup(outputPath!!)
                    return DoctorCheck(
                        "file-export",
                        "Decryption export to M4B",
                        DoctorSeverity.Error,
                        "Pipeline cancelled at position ${lastProgress:hh\:mm\:ss}.",
                        "An internal error caused the decryption pipeline to abort. Run with `--verbose` for details."
                    )
                } catch (ex Exception) {
                    TryCleanup(outputPath!!)
                    return DoctorCheck(
                        "file-export",
                        "Decryption export to M4B",
                        DoctorSeverity.Error,
                        "Failed at ${lastProgress:hh\:mm\:ss}: ${ex.GetType().Name}: ${ex.Message}",
                        DiagnoseExportError(ex)
                    )
                }
                let elapsed = sw.Elapsed
                let outputInfo = FileInfo(outputPath!!)
                let inputInfo = FileInfo(filePath)
                let ratio = if inputInfo.Length > int64(0) {
                    float64(outputInfo.Length) / float64(inputInfo.Length)
                } else {
                    float64(0.0)
                }
                if ratio < 0.5 {
                    TryCleanup(outputPath!!)
                    return DoctorCheck(
                        "file-export",
                        "Decryption export to M4B",
                        DoctorSeverity.Error,
                        "Output suspiciously small (${float64(outputInfo.Length) / (1024.0 * float64(1024.0)):F1} MiB, ${ratio:P0} of input).",
                        "The decryption pipeline exited early. This indicates a bug in the frame processing."
                    )
                }
                let sizeStr = "${float64(outputInfo.Length) / (1024.0 * float64(1024.0)):F1} MiB"
                return DoctorCheck(
                    "file-export",
                    "Decryption export to M4B",
                    DoctorSeverity.Ok,
                    "Success in ${FormatElapsed(elapsed)}. Output: $sizeStr at ${lastSpeed:F0}x realtime → $outputPath"
                )
            } catch (ex Exception) {
                TryCleanup(outputPath!!)
                return DoctorCheck(
                    "file-export",
                    "Decryption export to M4B",
                    DoctorSeverity.Error,
                    "Unexpected error: ${ex.GetType().Name}: ${ex.Message}"
                )
            } finally {
                aaxFile?.Dispose()
                inputStream?.Dispose()
            }
        }

        private func FindDatabasePath() string? {
            let dataDir = Path.Combine(CliPaths.SharedUserDataDir, "data")
            let dbPath = Path.Combine(dataDir, "audiobooks.db")
            return if File.Exists(dbPath) {
                dbPath
            } else {
                default(string?)
            }
        }

        private func ExtractAsinFromFilename(filePath string) string? {
            let fileName = Path.GetFileNameWithoutExtension(filePath)
            let parts = fileName.Split('_')
            for part in parts {
                if part.Length == 10 && part.StartsWith("B0", StringComparison.OrdinalIgnoreCase) {
                    return part
                }
            }
            return nil
        }

        private func FormatElapsed(elapsed TimeSpan) string {
            return if elapsed.TotalMinutes >= float64(1.0) {
                "${elapsed.TotalMinutes:F1}min"
            } else {
                "${elapsed.TotalSeconds:F1}s"
            }
        }

        private func DiagnoseExportError(ex Exception) string {
            let msg = ex.Message.ToLowerInvariant()
            if msg.Contains("end of stream") || msg.Contains("truncat") {
                return "The file may be truncated. Re-download the book."
            }
            if msg.Contains("key") || msg.Contains("checksum") {
                return "The decryption key appears incorrect. Re-acquire the license."
            }
            if msg.Contains("memory") {
                return "Out of memory. The system may be low on RAM."
            }
            if msg.Contains("access") || msg.Contains("permission") || msg.Contains("denied") {
                return "Permission error. Check output directory permissions."
            }
            if msg.Contains("disk") || msg.Contains("space") {
                return "Insufficient disk space."
            }
            return "Check the error above. The file may be corrupt or the decryption pipeline has a bug."
        }

        private func TryCleanup(path string) {
            try {
                if File.Exists(path) {
                    File.Delete(path)
                }
            } catch {
                // best effort

            }
        }
    }
}

/// Options for (cref:FileDiagnosticService.Run).
class FileDiagnosticOptions {
    /// Path to the .aaxc or .aax file.
    prop FilePath string {
        get;
        init;
    }

    /// Hex-encoded 16-byte decryption key (optional — looked up from DB if omitted).
    prop Key string? {
        get;
        init;
    }

    /// Hex-encoded 16-byte initialization vector (optional — looked up from DB if omitted).
    prop Iv string? {
        get;
        init;
    }

    /// Book ASIN for database key lookup (auto-detected from filename if omitted).
    prop Asin string? {
        get;
        init;
    }

    /// Path to audiobooks.db (auto-detected if omitted).
    prop DatabasePath string? {
        get;
        init;
    }

    /// Whether to perform a full decryption export.
    prop AttemptExport bool {
        get;
        init;
    }

    /// Output .m4b file path (defaults to input with .m4b extension).
    prop OutputPath string? {
        get;
        init;
    }
}
