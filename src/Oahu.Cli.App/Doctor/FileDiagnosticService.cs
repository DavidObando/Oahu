using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Oahu.Cli.App.Paths;
using Oahu.Decrypt;

namespace Oahu.Cli.App.Doctor;

/// <summary>
/// Diagnostics for encrypted audiobook files (.aaxc/.aax).
/// Checks file integrity, MPEG-4 structure, key resolution, and performs a
/// trial export to verify the decryption pipeline works end-to-end.
/// </summary>
public sealed class FileDiagnosticService
{
    private readonly ILogger logger;

    public FileDiagnosticService(ILogger? logger = null)
    {
        this.logger = logger ?? Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance;
    }

    /// <summary>
    /// Run file diagnostics. If <paramref name="attemptExport"/> is true, performs
    /// a full decryption pass and writes to <paramref name="outputPath"/>.
    /// </summary>
    public DoctorReport Run(FileDiagnosticOptions options)
    {
        var checks = new List<DoctorCheck>();

        // 1. File integrity
        var fileCheck = CheckFileIntegrity(options.FilePath);
        checks.Add(fileCheck);
        if (fileCheck.Severity == DoctorSeverity.Error)
        {
            return new DoctorReport(checks);
        }

        // 2. MPEG-4 structure
        var structureCheck = CheckMpeg4Structure(options.FilePath);
        checks.Add(structureCheck);
        if (structureCheck.Severity == DoctorSeverity.Error)
        {
            return new DoctorReport(checks);
        }

        // 3. Key resolution
        var (keyCheck, resolvedKey, resolvedIv) = ResolveKey(options);
        checks.Add(keyCheck);
        if (keyCheck.Severity == DoctorSeverity.Error)
        {
            return new DoctorReport(checks);
        }

        // 4. Key validation (can it be applied to the file?)
        var keyValidation = CheckKeyAccepted(options.FilePath, resolvedKey!, resolvedIv!);
        checks.Add(keyValidation);
        if (keyValidation.Severity == DoctorSeverity.Error)
        {
            return new DoctorReport(checks);
        }

        // 5. Export (if requested)
        if (options.AttemptExport)
        {
            var exportCheck = RunExport(options.FilePath, resolvedKey!, resolvedIv!, options.OutputPath);
            checks.Add(exportCheck);
        }

        return new DoctorReport(checks);
    }

    private static DoctorCheck CheckFileIntegrity(string filePath)
    {
        if (!File.Exists(filePath))
        {
            return new DoctorCheck(
                "file-exists",
                "File exists and is readable",
                DoctorSeverity.Error,
                $"File not found: {filePath}",
                "Check the file path. The download may have been moved or deleted.");
        }

        try
        {
            var info = new FileInfo(filePath);
            if (info.Length == 0)
            {
                return new DoctorCheck(
                    "file-exists",
                    "File exists and is readable",
                    DoctorSeverity.Error,
                    $"File is empty (0 bytes): {filePath}",
                    "Re-download the book.");
            }

            // Quick read test
            using var fs = File.OpenRead(filePath);
            var buf = new byte[8];
            var read = fs.Read(buf, 0, 8);
            if (read < 8)
            {
                return new DoctorCheck(
                    "file-exists",
                    "File exists and is readable",
                    DoctorSeverity.Error,
                    $"File too small ({info.Length} bytes) — likely corrupt.",
                    "Re-download the book.");
            }

            var sizeStr = info.Length >= 1024 * 1024
                ? $"{info.Length / (1024.0 * 1024):F1} MiB"
                : $"{info.Length / 1024.0:F1} KiB";

            return new DoctorCheck(
                "file-exists",
                "File exists and is readable",
                DoctorSeverity.Ok,
                $"{sizeStr} — {Path.GetFileName(filePath)}");
        }
        catch (Exception ex)
        {
            return new DoctorCheck(
                "file-exists",
                "File exists and is readable",
                DoctorSeverity.Error,
                $"Cannot read file: {ex.Message}",
                "Check file permissions.");
        }
    }

    private static DoctorCheck CheckMpeg4Structure(string filePath)
    {
        try
        {
            using var fs = File.OpenRead(filePath);
            using var aax = new AaxFile(fs);

            var details = $"Type={aax.FileType}, Duration={aax.Duration:hh\\:mm\\:ss}, " +
                         $"Channels={aax.AudioChannels}, SampleRate={aax.TimeScale}Hz";

            return new DoctorCheck(
                "mpeg4-structure",
                "Valid MPEG-4 container",
                DoctorSeverity.Ok,
                details);
        }
        catch (Exception ex)
        {
            return new DoctorCheck(
                "mpeg4-structure",
                "Valid MPEG-4 container",
                DoctorSeverity.Error,
                $"Failed to parse: {ex.GetType().Name}: {ex.Message}",
                "The file may be corrupt or truncated. Try re-downloading.");
        }
    }

    private (DoctorCheck Check, string? Key, string? Iv) ResolveKey(FileDiagnosticOptions options)
    {
        // If key/IV explicitly provided, validate format
        if (!string.IsNullOrWhiteSpace(options.Key) && !string.IsNullOrWhiteSpace(options.Iv))
        {
            if (options.Key.Length != 32 || !options.Key.All(char.IsAsciiHexDigit))
            {
                return (new DoctorCheck(
                    "key-resolve",
                    "Decryption key resolved",
                    DoctorSeverity.Error,
                    $"Key must be 32 hex characters. Got {options.Key.Length} chars."), null, null);
            }

            if (options.Iv.Length != 32 || !options.Iv.All(char.IsAsciiHexDigit))
            {
                return (new DoctorCheck(
                    "key-resolve",
                    "Decryption key resolved",
                    DoctorSeverity.Error,
                    $"IV must be 32 hex characters. Got {options.Iv.Length} chars."), null, null);
            }

            return (new DoctorCheck(
                "key-resolve",
                "Decryption key resolved",
                DoctorSeverity.Ok,
                $"Key/IV provided via arguments. Key={options.Key[..8]}..."), options.Key, options.Iv);
        }

        // Try database lookup
        var asin = options.Asin ?? ExtractAsinFromFilename(options.FilePath);
        if (string.IsNullOrWhiteSpace(asin))
        {
            return (new DoctorCheck(
                "key-resolve",
                "Decryption key resolved",
                DoctorSeverity.Error,
                "No key/IV provided and could not determine ASIN from filename.",
                "Pass --key and --iv, or --asin to look up from the library database."), null, null);
        }

        return LookupKeyFromDatabase(asin, options.DatabasePath);
    }

    private (DoctorCheck Check, string? Key, string? Iv) LookupKeyFromDatabase(string asin, string? dbPath)
    {
        dbPath ??= FindDatabasePath();

        if (dbPath is null)
        {
            return (new DoctorCheck(
                "key-resolve",
                "Decryption key resolved",
                DoctorSeverity.Error,
                "Library database (audiobooks.db) not found.",
                "Run `oahu-cli auth login` and sync your library, or pass --key and --iv manually."), null, null);
        }

        try
        {
            var dbDir = Path.GetDirectoryName(dbPath)!;
            var dbFile = Path.GetFileName(dbPath);
            using var db = new Oahu.BooksDatabase.BookDbContext(dbDir, dbFile);

            var book = db.Books.FirstOrDefault(b => b.Asin == asin);
            if (book is null)
            {
                return (new DoctorCheck(
                    "key-resolve",
                    "Decryption key resolved",
                    DoctorSeverity.Error,
                    $"ASIN '{asin}' not found in library database.",
                    "Run `oahu-cli library sync` to refresh, or pass --key and --iv."), null, null);
            }

            var key = book.LicenseKey;
            var iv = book.LicenseIv;

            if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv))
            {
                return (new DoctorCheck(
                    "key-resolve",
                    "Decryption key resolved",
                    DoctorSeverity.Error,
                    $"ASIN '{asin}' found but license key/IV are empty.",
                    "Run `oahu-cli download {asin}` to acquire the license."), null, null);
            }

            return (new DoctorCheck(
                "key-resolve",
                "Decryption key resolved",
                DoctorSeverity.Ok,
                $"Loaded from database for ASIN '{asin}'. Key={key[..8]}..."), key, iv);
        }
        catch (Exception ex)
        {
            return (new DoctorCheck(
                "key-resolve",
                "Decryption key resolved",
                DoctorSeverity.Error,
                $"Database query failed: {ex.Message}",
                "Ensure the database is not locked by another process."), null, null);
        }
    }

    private static DoctorCheck CheckKeyAccepted(string filePath, string key, string iv)
    {
        try
        {
            using var fs = File.OpenRead(filePath);
            using var aax = new AaxFile(fs);
            aax.SetDecryptionKey(key, iv);

            return new DoctorCheck(
                "key-validate",
                "Decryption key accepted",
                DoctorSeverity.Ok,
                "Key/IV applied successfully to the file.");
        }
        catch (Exception ex)
        {
            return new DoctorCheck(
                "key-validate",
                "Decryption key accepted",
                DoctorSeverity.Error,
                $"Key rejected: {ex.GetType().Name}: {ex.Message}",
                "The key/IV may not match this file. Try re-downloading the license.");
        }
    }

    private static DoctorCheck RunExport(string filePath, string key, string iv, string? outputPath)
    {
        // Run async export on thread pool to avoid deadlocking
        return Task.Run(() => RunExportAsync(filePath, key, iv, outputPath)).GetAwaiter().GetResult();
    }

    private static async Task<DoctorCheck> RunExportAsync(string filePath, string key, string iv, string? outputPath)
    {
        outputPath ??= Path.ChangeExtension(filePath, ".m4b");
        var outputDir = Path.GetDirectoryName(outputPath) ?? ".";

        try
        {
            Directory.CreateDirectory(outputDir);
        }
        catch (Exception ex)
        {
            return new DoctorCheck(
                "file-export",
                "Decryption export to M4B",
                DoctorSeverity.Error,
                $"Cannot write to output directory: {ex.Message}");
        }

        FileStream? inputStream = null;
        AaxFile? aaxFile = null;

        try
        {
            inputStream = File.OpenRead(filePath);
            aaxFile = new AaxFile(inputStream);
            aaxFile.SetDecryptionKey(key, iv);

            var sw = Stopwatch.StartNew();
            TimeSpan lastProgress = TimeSpan.Zero;
            double lastSpeed = 0;

            var outputStream = File.Create(outputPath);
            var operation = aaxFile.ConvertToMp4aAsync(outputStream);

            operation.ConversionProgressUpdate += (_, e) =>
            {
                lastProgress = e.ProcessPosition;
                lastSpeed = e.ProcessSpeed;
            };

            try
            {
                await operation;
            }
            catch (OperationCanceledException)
            {
                TryCleanup(outputPath);
                return new DoctorCheck(
                    "file-export",
                    "Decryption export to M4B",
                    DoctorSeverity.Error,
                    $"Pipeline cancelled at position {lastProgress:hh\\:mm\\:ss}.",
                    "An internal error caused the decryption pipeline to abort. Run with `--verbose` for details.");
            }
            catch (Exception ex)
            {
                TryCleanup(outputPath);
                return new DoctorCheck(
                    "file-export",
                    "Decryption export to M4B",
                    DoctorSeverity.Error,
                    $"Failed at {lastProgress:hh\\:mm\\:ss}: {ex.GetType().Name}: {ex.Message}",
                    DiagnoseExportError(ex));
            }

            var elapsed = sw.Elapsed;
            var outputInfo = new FileInfo(outputPath);
            var inputInfo = new FileInfo(filePath);
            var ratio = inputInfo.Length > 0 ? outputInfo.Length / (double)inputInfo.Length : 0;

            if (ratio < 0.5)
            {
                TryCleanup(outputPath);
                return new DoctorCheck(
                    "file-export",
                    "Decryption export to M4B",
                    DoctorSeverity.Error,
                    $"Output suspiciously small ({outputInfo.Length / (1024.0 * 1024):F1} MiB, {ratio:P0} of input).",
                    "The decryption pipeline exited early. This indicates a bug in the frame processing.");
            }

            var sizeStr = $"{outputInfo.Length / (1024.0 * 1024):F1} MiB";
            return new DoctorCheck(
                "file-export",
                "Decryption export to M4B",
                DoctorSeverity.Ok,
                $"Success in {FormatElapsed(elapsed)}. Output: {sizeStr} at {lastSpeed:F0}x realtime → {outputPath}");
        }
        catch (Exception ex)
        {
            TryCleanup(outputPath);
            return new DoctorCheck(
                "file-export",
                "Decryption export to M4B",
                DoctorSeverity.Error,
                $"Unexpected error: {ex.GetType().Name}: {ex.Message}");
        }
        finally
        {
            aaxFile?.Dispose();
            inputStream?.Dispose();
        }
    }

    private static string? FindDatabasePath()
    {
        var dataDir = Path.Combine(CliPaths.SharedUserDataDir, "data");
        var dbPath = Path.Combine(dataDir, "audiobooks.db");
        return File.Exists(dbPath) ? dbPath : null;
    }

    private static string? ExtractAsinFromFilename(string filePath)
    {
        var fileName = Path.GetFileNameWithoutExtension(filePath);
        var parts = fileName.Split('_');

        foreach (var part in parts)
        {
            if (part.Length == 10 && part.StartsWith("B0", StringComparison.OrdinalIgnoreCase))
            {
                return part;
            }
        }

        return null;
    }

    private static string FormatElapsed(TimeSpan elapsed)
    {
        return elapsed.TotalMinutes >= 1
            ? $"{elapsed.TotalMinutes:F1}min"
            : $"{elapsed.TotalSeconds:F1}s";
    }

    private static string DiagnoseExportError(Exception ex)
    {
        var msg = ex.Message.ToLowerInvariant();

        if (msg.Contains("end of stream") || msg.Contains("truncat"))
        {
            return "The file may be truncated. Re-download the book.";
        }

        if (msg.Contains("key") || msg.Contains("checksum"))
        {
            return "The decryption key appears incorrect. Re-acquire the license.";
        }

        if (msg.Contains("memory"))
        {
            return "Out of memory. The system may be low on RAM.";
        }

        if (msg.Contains("access") || msg.Contains("permission") || msg.Contains("denied"))
        {
            return "Permission error. Check output directory permissions.";
        }

        if (msg.Contains("disk") || msg.Contains("space"))
        {
            return "Insufficient disk space.";
        }

        return "Check the error above. The file may be corrupt or the decryption pipeline has a bug.";
    }

    private static void TryCleanup(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // best effort
        }
    }
}

/// <summary>Options for <see cref="FileDiagnosticService.Run"/>.</summary>
public sealed class FileDiagnosticOptions
{
    /// <summary>Path to the .aaxc or .aax file.</summary>
    public required string FilePath { get; init; }

    /// <summary>Hex-encoded 16-byte decryption key (optional — looked up from DB if omitted).</summary>
    public string? Key { get; init; }

    /// <summary>Hex-encoded 16-byte initialization vector (optional — looked up from DB if omitted).</summary>
    public string? Iv { get; init; }

    /// <summary>Book ASIN for database key lookup (auto-detected from filename if omitted).</summary>
    public string? Asin { get; init; }

    /// <summary>Path to audiobooks.db (auto-detected if omitted).</summary>
    public string? DatabasePath { get; init; }

    /// <summary>Whether to perform a full decryption export.</summary>
    public bool AttemptExport { get; init; }

    /// <summary>Output .m4b file path (defaults to input with .m4b extension).</summary>
    public string? OutputPath { get; init; }
}
