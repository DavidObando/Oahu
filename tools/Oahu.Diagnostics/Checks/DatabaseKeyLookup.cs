using Oahu.BooksDatabase;

namespace Oahu.Diagnostics.Checks;

/// <summary>
/// Looks up the LicenseKey and LicenseIv for a given ASIN from the Oahu library database
/// (audiobooks.db SQLite file shared with the GUI and CLI).
/// </summary>
public static class DatabaseKeyLookup
{
    /// <summary>
    /// Attempts to find the default audiobooks.db path on this system.
    /// On macOS: ~/Library/Application Support/Oahu/data/audiobooks.db
    /// On Linux: ~/.local/share/Oahu/data/audiobooks.db
    /// On Windows: %LOCALAPPDATA%/Oahu/data/audiobooks.db
    /// </summary>
    public static string? FindDatabasePath()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var dbPath = Path.Combine(localAppData, "Oahu", "data", "audiobooks.db");
        return File.Exists(dbPath) ? dbPath : null;
    }

    public static (DiagnosticCheck Check, string? Key, string? Iv) LookupKey(string asin, string? dbPath = null)
    {
        dbPath ??= FindDatabasePath();

        if (dbPath is null)
        {
            return (new DiagnosticCheck
            {
                Id = "db-lookup",
                Title = "Database key lookup",
                Severity = DiagSeverity.Error,
                Detail = "Could not find audiobooks.db. The Oahu library database does not exist at the expected path.",
                Hint = "Run `oahu-cli auth login` and `oahu-cli library sync` first, or pass --key and --iv manually.",
            }, null, null);
        }

        try
        {
            var dbDir = Path.GetDirectoryName(dbPath)!;
            var dbFile = Path.GetFileName(dbPath);
            using var db = new BookDbContext(dbDir, dbFile);

            var book = db.Books.FirstOrDefault(b => b.Asin == asin);
            if (book is null)
            {
                return (new DiagnosticCheck
                {
                    Id = "db-lookup",
                    Title = "Database key lookup",
                    Severity = DiagSeverity.Error,
                    Detail = $"ASIN '{asin}' not found in the library database at {dbPath}.",
                    Hint = "Run `oahu-cli library sync` to refresh the library cache.",
                }, null, null);
            }

            var licenseKey = book.LicenseKey;
            var licenseIv = book.LicenseIv;

            if (string.IsNullOrWhiteSpace(licenseKey) || string.IsNullOrWhiteSpace(licenseIv))
            {
                return (new DiagnosticCheck
                {
                    Id = "db-lookup",
                    Title = "Database key lookup",
                    Severity = DiagSeverity.Error,
                    Detail = $"ASIN '{asin}' found but LicenseKey/IV are empty. License may not have been acquired yet.",
                    Hint = "Run `oahu-cli download <asin>` to acquire the license, then retry.",
                }, null, null);
            }

            return (new DiagnosticCheck
            {
                Id = "db-lookup",
                Title = "Database key lookup",
                Severity = DiagSeverity.Ok,
                Detail = $"Found key/IV for ASIN '{asin}' in {dbPath}. Key={licenseKey[..8]}..., IV={licenseIv[..8]}...",
            }, licenseKey, licenseIv);
        }
        catch (Exception ex)
        {
            return (new DiagnosticCheck
            {
                Id = "db-lookup",
                Title = "Database key lookup",
                Severity = DiagSeverity.Error,
                Detail = $"Failed to query database: {ex.GetType().Name}: {ex.Message}",
                Hint = "Ensure the database is not locked by another process.",
            }, null, null);
        }
    }
}
