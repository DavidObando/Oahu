namespace Oahu.Diagnostics.Checks;

/// <summary>Verifies the target file exists, is readable, and has a non-trivial size.</summary>
public static class FileIntegrityCheck
{
    public static DiagnosticCheck Run(string filePath)
    {
        const string id = "file-integrity";
        const string title = "File exists and is readable";

        try
        {
            if (!File.Exists(filePath))
            {
                return new DiagnosticCheck
                {
                    Id = id,
                    Title = title,
                    Severity = DiagSeverity.Error,
                    Detail = $"File not found: {filePath}",
                    Hint = "Verify the path is correct. The file may have been deleted after a failed download.",
                };
            }

            var info = new FileInfo(filePath);

            if (info.Length == 0)
            {
                return new DiagnosticCheck
                {
                    Id = id,
                    Title = title,
                    Severity = DiagSeverity.Error,
                    Detail = "File is 0 bytes — download likely never started or was immediately interrupted.",
                    Hint = "Re-download the book with `oahu-cli download`.",
                };
            }

            // AAXC files are typically at least a few hundred KB for even very short audio.
            if (info.Length < 4096)
            {
                return new DiagnosticCheck
                {
                    Id = id,
                    Title = title,
                    Severity = DiagSeverity.Warning,
                    Detail = $"File is suspiciously small ({info.Length} bytes) — may be a truncated download.",
                    Hint = "Re-download the book. A valid audiobook file is typically many megabytes.",
                };
            }

            // Try opening for read to confirm permissions.
            using (File.OpenRead(filePath))
            {
            }

            return new DiagnosticCheck
            {
                Id = id,
                Title = title,
                Severity = DiagSeverity.Ok,
                Detail = $"{info.Length:N0} bytes ({info.Length / (1024.0 * 1024):F2} MiB)",
            };
        }
        catch (Exception ex)
        {
            return new DiagnosticCheck
            {
                Id = id,
                Title = title,
                Severity = DiagSeverity.Error,
                Detail = $"Cannot access file: {ex.Message}",
                Hint = "Check file permissions.",
            };
        }
    }
}
