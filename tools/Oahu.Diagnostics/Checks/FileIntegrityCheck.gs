package Oahu.Diagnostics.Checks

import Oahu.Diagnostics
import System
import System.IO

/// Verifies the target file exists, is readable, and has a non-trivial size.
class FileIntegrityCheck {
    shared {
        func Run(filePath string) DiagnosticCheck {
            const id = "file-integrity"
            const title = "File exists and is readable"
            try {
                if !File.Exists(filePath) {
                    return DiagnosticCheck{
                        Id: id,
                        Title: title,
                        Severity: DiagSeverity.Error,
                        Detail: "File not found: $filePath",
                        Hint: "Verify the path is correct. The file may have been deleted after a failed download."
                    }
                }
                let info = FileInfo(filePath)
                if info.Length == int64(0) {
                    return DiagnosticCheck{
                        Id: id,
                        Title: title,
                        Severity: DiagSeverity.Error,
                        Detail: "File is 0 bytes — download likely never started or was immediately interrupted.",
                        Hint: "Re-download the book with `oahu-cli download`."
                    }
                }
                // AAXC files are typically at least a few hundred KB for even very short audio.
                if info.Length < int64(4096) {
                    return DiagnosticCheck{
                        Id: id,
                        Title: title,
                        Severity: DiagSeverity.Warning,
                        Detail: "File is suspiciously small (${info.Length} bytes) — may be a truncated download.",
                        Hint: "Re-download the book. A valid audiobook file is typically many megabytes."
                    }
                }
                // Try opening for read to confirm permissions.
                {
                    using let _ = File.OpenRead(filePath)
                }
                return DiagnosticCheck{
                    Id: id,
                    Title: title,
                    Severity: DiagSeverity.Ok,
                    Detail: "${info.Length:N0} bytes (${float64(info.Length) / (1024.0 * float64(1024.0)):F2} MiB)"
                }
            } catch (ex Exception) {
                return DiagnosticCheck{
                    Id: id,
                    Title: title,
                    Severity: DiagSeverity.Error,
                    Detail: "Cannot access file: ${ex.Message}",
                    Hint: "Check file permissions."
                }
            }
        }
    }
}
