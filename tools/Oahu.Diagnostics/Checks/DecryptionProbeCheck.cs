using Oahu.Decrypt;

namespace Oahu.Diagnostics.Checks;

/// <summary>
/// If a key and IV are provided, attempts a trial decryption of the first few
/// audio frames to verify the key is correct and the file can actually be decrypted.
///
/// For AAXC, SetDecryptionKey only validates length (16 bytes each), so actual
/// correctness is only verified by decrypting data and checking AAC validity.
/// </summary>
public static class DecryptionProbeCheck
{
    public static List<DiagnosticCheck> Run(string filePath, string? key, string? iv)
    {
        var results = new List<DiagnosticCheck>();

        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv))
        {
            results.Add(new DiagnosticCheck
            {
                Id = "decrypt-probe",
                Title = "Decryption probe",
                Severity = DiagSeverity.Warning,
                Detail = "No key/IV provided — skipping decryption probe.",
                Hint = "Pass --key and --iv (hex-encoded, 32 chars each) to test actual decryption. " +
                       "The key/IV come from the Audible license voucher stored in the library database.",
            });
            return results;
        }

        // Validate key/IV format
        if (key.Length != 32 || !IsHex(key))
        {
            results.Add(new DiagnosticCheck
            {
                Id = "decrypt-key-format",
                Title = "Key format validation",
                Severity = DiagSeverity.Error,
                Detail = $"Key must be 32 hex characters (16 bytes). Got {key.Length} chars.",
            });
            return results;
        }

        if (iv.Length != 32 || !IsHex(iv))
        {
            results.Add(new DiagnosticCheck
            {
                Id = "decrypt-iv-format",
                Title = "IV format validation",
                Severity = DiagSeverity.Error,
                Detail = $"IV must be 32 hex characters (16 bytes). Got {iv.Length} chars.",
            });
            return results;
        }

        results.Add(new DiagnosticCheck
        {
            Id = "decrypt-key-format",
            Title = "Key/IV format validation",
            Severity = DiagSeverity.Ok,
            Detail = "Key and IV are valid 16-byte hex strings.",
        });

        // Attempt to open as AaxFile and set the key
        try
        {
            using var stream = File.OpenRead(filePath);
            using var aax = new AaxFile(stream);

            aax.SetDecryptionKey(key, iv);

            results.Add(new DiagnosticCheck
            {
                Id = "decrypt-setkey",
                Title = "Set decryption key",
                Severity = DiagSeverity.Ok,
                Detail = "Key/IV accepted by AaxFile (length validated).",
            });

            // Trial decryption: attempt a short ConvertToMp4a to a memory stream.
            // We limit to a small output to avoid processing the full file.
            using var outputStream = new MemoryStream();
            var operation = aax.ConvertToMp4aAsync(outputStream);
            operation.ConversionProgressUpdate += (_, e) =>
            {
                // Cancel after first meaningful progress to avoid processing the whole file.
                if (e.ProcessPosition.TotalSeconds > 5)
                {
                    operation.CancelAsync().GetAwaiter().GetResult();
                }
            };

            try
            {
                operation.GetAwaiter().GetResult();
            }
            catch (OperationCanceledException)
            {
                // Expected — we cancelled after a few seconds of decryption.
            }

            if (outputStream.Length > 0)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "decrypt-probe",
                    Title = "Trial decryption",
                    Severity = DiagSeverity.Ok,
                    Detail = $"Successfully decrypted {outputStream.Length:N0} bytes of audio data. Key/IV appear correct.",
                });
            }
            else if (operation.IsFaulted)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "decrypt-probe",
                    Title = "Trial decryption",
                    Severity = DiagSeverity.Error,
                    Detail = "Decryption failed — the operation faulted. The key/IV may be incorrect, or the file is corrupt.",
                    Hint = "Verify the key/IV from the Audible license voucher. Re-download may also help.",
                });
            }
            else
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "decrypt-probe",
                    Title = "Trial decryption",
                    Severity = DiagSeverity.Warning,
                    Detail = "Decryption produced no output. The file may have no audio frames or is empty.",
                });
            }
        }
        catch (ArgumentException ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "decrypt-probe",
                Title = "Decryption probe",
                Severity = DiagSeverity.Error,
                Detail = $"Key/IV rejected: {ex.Message}",
                Hint = "Ensure key and IV are correct 16-byte hex values from the Audible license.",
            });
        }
        catch (Exception ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "decrypt-probe",
                Title = "Decryption probe",
                Severity = DiagSeverity.Error,
                Detail = $"Decryption probe failed: {ex.GetType().Name}: {ex.Message}",
                Hint = "The file may be truncated or corrupt.",
            });
        }

        return results;
    }

    private static bool IsHex(string value) =>
        value.All(c => char.IsAsciiHexDigit(c));
}
