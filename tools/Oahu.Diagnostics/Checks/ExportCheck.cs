using System.Diagnostics;
using Oahu.Decrypt;

namespace Oahu.Diagnostics.Checks;

/// <summary>
/// Attempts a full decryption and export of the encrypted file to .m4b format.
/// This exercises the same code path as oahu-cli's decryption pipeline:
/// AaxFile → SetDecryptionKey → ConvertToMp4aAsync → output stream.
///
/// Reports detailed timing, progress, and any exceptions encountered.
/// </summary>
public static class ExportCheck
{
    public static List<DiagnosticCheck> Run(string filePath, string? key, string? iv, string? outputPath)
    {
        // Run the async export synchronously on a thread pool thread to avoid
        // deadlocking the main thread (Mp4Operation uses ContinueWith internally).
        return Task.Run(() => RunAsync(filePath, key, iv, outputPath)).GetAwaiter().GetResult();
    }

    private static async Task<List<DiagnosticCheck>> RunAsync(string filePath, string? key, string? iv, string? outputPath)
    {
        var results = new List<DiagnosticCheck>();

        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv))
        {
            results.Add(new DiagnosticCheck
            {
                Id = "export-prereq",
                Title = "Export prerequisites",
                Severity = DiagSeverity.Error,
                Detail = "Key and IV are required for export. Cannot decrypt without them.",
                Hint = "Pass --key and --iv, or use --db to auto-load from the library database.",
            });
            return results;
        }

        if (key.Length != 32 || !key.All(char.IsAsciiHexDigit))
        {
            results.Add(new DiagnosticCheck
            {
                Id = "export-key-format",
                Title = "Key format",
                Severity = DiagSeverity.Error,
                Detail = $"Key must be 32 hex characters (16 bytes). Got {key.Length} chars.",
            });
            return results;
        }

        if (iv.Length != 32 || !iv.All(char.IsAsciiHexDigit))
        {
            results.Add(new DiagnosticCheck
            {
                Id = "export-iv-format",
                Title = "IV format",
                Severity = DiagSeverity.Error,
                Detail = $"IV must be 32 hex characters (16 bytes). Got {iv.Length} chars.",
            });
            return results;
        }

        // Determine output path
        outputPath ??= Path.ChangeExtension(filePath, ".m4b");

        results.Add(new DiagnosticCheck
        {
            Id = "export-config",
            Title = "Export configuration",
            Severity = DiagSeverity.Ok,
            Detail = $"Input: {Path.GetFileName(filePath)}, Output: {outputPath}",
        });

        // Check output directory is writable
        var outputDir = Path.GetDirectoryName(outputPath) ?? ".";
        try
        {
            Directory.CreateDirectory(outputDir);
        }
        catch (Exception ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "export-output-dir",
                Title = "Output directory writable",
                Severity = DiagSeverity.Error,
                Detail = $"Cannot create output directory: {ex.Message}",
            });
            return results;
        }

        // Phase 1: Open and parse the file
        AaxFile? aaxFile = null;
        FileStream? inputStream = null;
        var sw = Stopwatch.StartNew();

        try
        {
            inputStream = File.OpenRead(filePath);
            var openTime = sw.Elapsed;

            try
            {
                aaxFile = new AaxFile(inputStream);
            }
            catch (Exception ex)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "export-parse",
                    Title = "Parse encrypted file",
                    Severity = DiagSeverity.Error,
                    Detail = $"Failed to parse as AaxFile: {ex.GetType().Name}: {ex.Message}",
                    Hint = "The file may be corrupt or truncated.",
                });
                inputStream.Dispose();
                return results;
            }

            results.Add(new DiagnosticCheck
            {
                Id = "export-parse",
                Title = "Parse encrypted file",
                Severity = DiagSeverity.Ok,
                Detail = $"Parsed in {openTime.TotalMilliseconds:F0}ms. " +
                         $"Type={aaxFile.FileType}, Duration={aaxFile.Duration:hh\\:mm\\:ss}, " +
                         $"Channels={aaxFile.AudioChannels}, SampleRate={aaxFile.TimeScale}Hz",
            });

            // Phase 2: Set decryption key
            sw.Restart();
            try
            {
                aaxFile.SetDecryptionKey(key, iv);
            }
            catch (Exception ex)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "export-setkey",
                    Title = "Set decryption key",
                    Severity = DiagSeverity.Error,
                    Detail = $"Key rejected: {ex.GetType().Name}: {ex.Message}",
                    Hint = "The key/IV may be incorrect or the file uses a different DRM scheme.",
                });
                aaxFile.Dispose();
                inputStream.Dispose();
                return results;
            }

            results.Add(new DiagnosticCheck
            {
                Id = "export-setkey",
                Title = "Set decryption key",
                Severity = DiagSeverity.Ok,
                Detail = "Key/IV accepted.",
            });

            // Phase 3: Perform full decryption/export
            sw.Restart();
            TimeSpan lastProgress = TimeSpan.Zero;
            double lastSpeed = 0;
            Exception? decryptException = null;
            bool completed = false;
            bool cancelled = false;

            try
            {
                var outputStream = File.Create(outputPath);
                var operation = aaxFile.ConvertToMp4aAsync(outputStream);

                operation.ConversionProgressUpdate += (_, e) =>
                {
                    lastProgress = e.ProcessPosition;
                    lastSpeed = e.ProcessSpeed;
                };

                // Await using the same pattern as AudibleApi.DecryptAsync:
                // `await operation` uses Mp4Operation's custom GetAwaiter which
                // starts the operation and awaits the continuation task.
                try
                {
                    await operation;
                    // If we get here without exception, check operation status.
                    // The continuation task may complete successfully even if the
                    // underlying reader was cancelled (see ChunkReader.RunAsync
                    // catch(OperationCanceledException){} pattern).
                    if (operation.IsFaulted)
                    {
                        decryptException = new Exception("Operation marked as faulted after await returned without throw.");
                    }
                    else
                    {
                        completed = true;
                    }
                }
                catch (OperationCanceledException ocex)
                {
                    cancelled = true;
                    decryptException = ocex;
                }
                catch (AggregateException agg)
                {
                    decryptException = agg.InnerException ?? agg;
                }
                catch (Exception ex)
                {
                    decryptException = ex;
                }

                var elapsed = sw.Elapsed;

                if (completed)
                {
                    var outputInfo = new FileInfo(outputPath);
                    var inputInfo = new FileInfo(filePath);
                    var ratio = outputInfo.Length / (double)inputInfo.Length;

                    var severity = DiagSeverity.Ok;
                    var extraNote = string.Empty;

                    // Sanity: decrypted output should be roughly the same size as encrypted input
                    // (minus DRM overhead). Flag if suspiciously small.
                    if (ratio < 0.5)
                    {
                        severity = DiagSeverity.Error;
                        extraNote = $" BUG: output is only {ratio:P0} of input size — decryption pipeline is broken. " +
                                    $"The ChunkReader likely exited early without processing audio frames.";
                    }

                    results.Add(new DiagnosticCheck
                    {
                        Id = "export-decrypt",
                        Title = "Decryption and export to M4B",
                        Severity = severity,
                        Detail = $"Completed in {FormatElapsed(elapsed)}. " +
                                 $"Output: {outputInfo.Length:N0} bytes ({outputInfo.Length / (1024.0 * 1024):F2} MiB). " +
                                 $"Speed: {lastSpeed:F1}x realtime.{extraNote}",
                        Hint = severity == DiagSeverity.Error
                            ? "The decryption pipeline ran but produced truncated output. This indicates a bug " +
                              "in the frame processing — likely the AavdFilter/AacValidateFilter threw an error " +
                              "on early frames causing the ChunkReader to cancel silently."
                            : null,
                    });

                    results.Add(new DiagnosticCheck
                    {
                        Id = "export-output",
                        Title = "Output file",
                        Severity = severity,
                        Detail = outputPath,
                    });
                }
                else if (cancelled)
                {
                    results.Add(new DiagnosticCheck
                    {
                        Id = "export-decrypt",
                        Title = "Decryption and export to M4B",
                        Severity = DiagSeverity.Error,
                        Detail = $"Cancelled after {FormatElapsed(elapsed)} at position {lastProgress:hh\\:mm\\:ss}.",
                        Hint = "The operation was unexpectedly cancelled.",
                    });
                    TryCleanup(outputPath);
                }
                else if (decryptException is not null)
                {
                    results.Add(new DiagnosticCheck
                    {
                        Id = "export-decrypt",
                        Title = "Decryption and export to M4B",
                        Severity = DiagSeverity.Error,
                        Detail = $"FAILED after {FormatElapsed(elapsed)} at position {lastProgress:hh\\:mm\\:ss}. " +
                                 $"{decryptException.GetType().Name}: {decryptException.Message}",
                        Hint = DiagnoseDecryptError(decryptException),
                    });
                    TryCleanup(outputPath);
                }
            }
            catch (Exception ex)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "export-decrypt",
                    Title = "Decryption and export to M4B",
                    Severity = DiagSeverity.Error,
                    Detail = $"Unexpected error: {ex.GetType().Name}: {ex.Message}",
                    Hint = DiagnoseDecryptError(ex),
                });
                TryCleanup(outputPath);
            }
        }
        catch (Exception ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "export-io",
                Title = "File I/O",
                Severity = DiagSeverity.Error,
                Detail = $"I/O error: {ex.GetType().Name}: {ex.Message}",
            });
        }
        finally
        {
            aaxFile?.Dispose();
            inputStream?.Dispose();
        }

        return results;
    }

    private static string FormatElapsed(TimeSpan elapsed)
    {
        if (elapsed.TotalMinutes >= 1)
        {
            return $"{elapsed.TotalMinutes:F1}min";
        }

        return $"{elapsed.TotalSeconds:F1}s";
    }

    private static string DiagnoseDecryptError(Exception ex)
    {
        var msg = ex.Message.ToLowerInvariant();

        if (msg.Contains("end of stream") || msg.Contains("premature") || msg.Contains("truncat"))
        {
            return "The file appears truncated — the download may have been interrupted. Re-download the book.";
        }

        if (msg.Contains("key") || msg.Contains("checksum") || msg.Contains("activation"))
        {
            return "The decryption key appears incorrect. Try re-acquiring the license with `oahu-cli download`.";
        }

        if (msg.Contains("memory") || msg.Contains("out of memory"))
        {
            return "Out of memory during decryption. The file may be very large or the system is low on RAM.";
        }

        if (msg.Contains("access") || msg.Contains("permission") || msg.Contains("denied"))
        {
            return "Permission error. Check that the output directory is writable.";
        }

        if (msg.Contains("disk") || msg.Contains("space") || msg.Contains("no space"))
        {
            return "Insufficient disk space for the output file.";
        }

        return "Check the error details above. The file may be corrupt, or there's an issue with the decryption pipeline.";
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
            // Best effort cleanup
        }
    }
}
