package Oahu.Diagnostics.Checks

import Oahu.BooksDatabase
import Oahu.Diagnostics
import System
import System.IO
import System.Linq

/// Looks up the LicenseKey and LicenseIv for a given ASIN from the Oahu library database
/// (audiobooks.db SQLite file shared with the GUI and CLI).
class DatabaseKeyLookup {
    shared {
        /// Attempts to find the default audiobooks.db path on this system.
        /// On macOS: ~/Library/Application Support/Oahu/data/audiobooks.db
        /// On Linux: ~/.local/share/Oahu/data/audiobooks.db
        /// On Windows: %LOCALAPPDATA%/Oahu/data/audiobooks.db
        func FindDatabasePath() string? {
            let localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
            let dbPath = Path.Combine(localAppData, "Oahu", "data", "audiobooks.db")
            return if File.Exists(dbPath) {
                dbPath
            } else {
                default(string?)
            }
        }

        func LookupKey(asin string, dbPath string? = nil)(Check DiagnosticCheck, Key string?, Iv string?) {
            var dbPath = dbPath
            dbPath ??= FindDatabasePath()
            if dbPath == nil {
                return (
                    DiagnosticCheck{
                        Id: "db-lookup",
                        Title: "Database key lookup",
                        Severity: DiagSeverity.Error,
                        Detail: "Could not find audiobooks.db. The Oahu library database does not exist at the expected path.",
                        Hint: "Run `oahu-cli auth login` and `oahu-cli library sync` first, or pass --key and --iv manually."
                    },
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
                        DiagnosticCheck{
                            Id: "db-lookup",
                            Title: "Database key lookup",
                            Severity: DiagSeverity.Error,
                            Detail: "ASIN '$asin' not found in the library database at $dbPath.",
                            Hint: "Run `oahu-cli library sync` to refresh the library cache."
                        },
                        nil,
                        nil
                    )
                }
                let licenseKey = book.LicenseKey
                let licenseIv = book.LicenseIv
                if string.IsNullOrWhiteSpace(licenseKey) || string.IsNullOrWhiteSpace(licenseIv) {
                    return (
                        DiagnosticCheck{
                            Id: "db-lookup",
                            Title: "Database key lookup",
                            Severity: DiagSeverity.Error,
                            Detail: "ASIN '$asin' found but LicenseKey/IV are empty. License may not have been acquired yet.",
                            Hint: "Run `oahu-cli download <asin>` to acquire the license, then retry."
                        },
                        nil,
                        nil
                    )
                }
                return (
                    DiagnosticCheck{
                        Id: "db-lookup",
                        Title: "Database key lookup",
                        Severity: DiagSeverity.Ok,
                        Detail: "Found key/IV for ASIN '$asin' in $dbPath. Key=${licenseKey!![..8]}..., IV=${licenseIv!![..8]}..."
                    },
                    licenseKey!!,
                    licenseIv!!
                )
            } catch (ex Exception) {
                return (
                    DiagnosticCheck{
                        Id: "db-lookup",
                        Title: "Database key lookup",
                        Severity: DiagSeverity.Error,
                        Detail: "Failed to query database: ${ex.GetType().Name}: ${ex.Message}",
                        Hint: "Ensure the database is not locked by another process."
                    },
                    nil,
                    nil
                )
            }
        }
    }
}
