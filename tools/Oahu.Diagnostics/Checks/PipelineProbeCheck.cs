using System.Security.Cryptography;
using Oahu.Decrypt;
using Oahu.Decrypt.Mpeg4.Boxes;
using Oahu.Decrypt.Mpeg4.Chunks;

namespace Oahu.Diagnostics.Checks;

/// <summary>
/// Probes the decryption pipeline at each stage to identify where processing fails.
/// Unlike ExportCheck which runs the full pipeline end-to-end, this check manually
/// exercises each component in isolation:
///   1. Chunk enumeration (are all chunks accessible?)
///   2. Individual frame decryption (does AES-CBC produce valid AAC?)
///   3. Frame validation (does AacValidateFilter pass or reject frames?)
///   4. Full pipeline timing correlation
/// </summary>
public static class PipelineProbeCheck
{
    public static List<DiagnosticCheck> Run(string filePath, string? key, string? iv)
    {
        return Task.Run(() => RunAsync(filePath, key, iv)).GetAwaiter().GetResult();
    }

    private static async Task<List<DiagnosticCheck>> RunAsync(string filePath, string? key, string? iv)
    {
        var results = new List<DiagnosticCheck>();

        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv))
        {
            results.Add(new DiagnosticCheck
            {
                Id = "pipeline-prereq",
                Title = "Pipeline probe prerequisites",
                Severity = DiagSeverity.Warning,
                Detail = "Key/IV required for pipeline probe. Skipping.",
            });
            return results;
        }

        byte[] keyBytes = Convert.FromHexString(key);
        byte[] ivBytes = Convert.FromHexString(iv);

        using var inputStream = File.OpenRead(filePath);
        AaxFile aaxFile;

        try
        {
            aaxFile = new AaxFile(inputStream);
        }
        catch (Exception ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "pipeline-parse",
                Title = "Pipeline probe: parse",
                Severity = DiagSeverity.Error,
                Detail = $"Cannot parse file: {ex.Message}",
            });
            return results;
        }

        using (aaxFile)
        {
            // Stage 1: Enumerate chunks and count them
            var audioTrack = aaxFile.Moov.AudioTrack;
            var textTrack = aaxFile.Moov.TextTrack;

            int audioChunkCount = 0;
            int textChunkCount = 0;
            long totalAudioBytes = 0;
            long totalAudioFrames = 0;
            long totalFirstSampleMax = 0;

            try
            {
                foreach (var chunk in audioTrack.ChunkEntries())
                {
                    audioChunkCount++;
                    totalAudioBytes += chunk.ChunkSize;
                    totalAudioFrames += chunk.FrameSizes.Length;
                    long chunkEnd = chunk.FirstSample + chunk.FrameDurations.Sum(d => (long)d);
                    if (chunkEnd > totalFirstSampleMax) totalFirstSampleMax = chunkEnd;
                }
            }
            catch (Exception ex)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "pipeline-enum-audio",
                    Title = "Pipeline probe: audio chunk enumeration",
                    Severity = DiagSeverity.Error,
                    Detail = $"Failed after {audioChunkCount} chunks: {ex.GetType().Name}: {ex.Message}",
                });
                return results;
            }

            if (textTrack is not null)
            {
                try
                {
                    foreach (var chunk in textTrack.ChunkEntries())
                    {
                        textChunkCount++;
                    }
                }
                catch (Exception ex)
                {
                    results.Add(new DiagnosticCheck
                    {
                        Id = "pipeline-enum-text",
                        Title = "Pipeline probe: text chunk enumeration",
                        Severity = DiagSeverity.Warning,
                        Detail = $"Text track enumeration failed: {ex.Message}",
                    });
                }
            }

            // Verify chunk range filtering
            var duration = aaxFile.Duration;
            uint timeScale = audioTrack.Mdia.Mdhd.Timescale;
            double maximumSample = duration.TotalSeconds * timeScale;
            long chunksInRange = 0;
            long chunksOutOfRange = 0;

            foreach (var chunk in audioTrack.ChunkEntries())
            {
                double minimumSample = 0; // StartTime = Zero
                long chunkEnd = chunk.FirstSample + chunk.FrameDurations.Sum(d => (long)d);
                bool inRange = chunk.FirstSample <= maximumSample && chunkEnd >= minimumSample;
                if (inRange) chunksInRange++;
                else chunksOutOfRange++;
            }

            results.Add(new DiagnosticCheck
            {
                Id = "pipeline-enum",
                Title = "Pipeline probe: chunk enumeration",
                Severity = chunksOutOfRange > 0 ? DiagSeverity.Warning : DiagSeverity.Ok,
                Detail = $"Audio: {audioChunkCount:N0} chunks, {totalAudioFrames:N0} frames, " +
                         $"{totalAudioBytes / (1024.0 * 1024):F1} MiB. Text: {textChunkCount} chunks. " +
                         $"In-range: {chunksInRange}, out-of-range: {chunksOutOfRange}. " +
                         $"Duration: {duration:hh\\:mm\\:ss}, MaxSample: {totalFirstSampleMax:N0}, " +
                         $"MaxSampleExpected: {maximumSample:N0}",
            });

            // Stage 2: Read and decrypt first N frames manually
            int framesToTest = 5000;
            int framesDecrypted = 0;
            int framesValidationPassed = 0;
            int framesValidationFailed = 0;
            int framesTooSmall = 0;
            string? firstFailureDetail = null;

            using var aes = Aes.Create();
            aes.Key = keyBytes;

            var firstChunks = audioTrack.ChunkEntries().Take(500).ToList();

            foreach (var chunk in firstChunks)
            {
                if (framesDecrypted >= framesToTest) break;

                // Read chunk data from file
                byte[] chunkData = new byte[chunk.ChunkSize];
                inputStream.Position = chunk.ChunkOffset;
                await inputStream.ReadExactlyAsync(chunkData);

                int offset = 0;
                for (int f = 0; f < chunk.FrameSizes.Length && framesDecrypted < framesToTest; f++)
                {
                    int frameSize = chunk.FrameSizes[f];
                    var frameData = chunkData.AsSpan(offset, frameSize);

                    if (frameSize >= 16)
                    {
                        // Decrypt same way as AavdFilter
                        int encSize = frameSize & 0x7FFFFFF0;
                        byte[] decrypted = frameData.ToArray();
                        aes.DecryptCbc(decrypted.AsSpan(0, encSize), ivBytes, decrypted.AsSpan(0, encSize), PaddingMode.None);

                        // Validate same way as AacValidateFilter
                        ushort header = (ushort)(decrypted[0] << 8 | decrypted[1]);
                        bool valid = (header & 0xFFF0) != 0xFFF0;

                        if (valid)
                        {
                            framesValidationPassed++;
                        }
                        else
                        {
                            framesValidationFailed++;
                            if (firstFailureDetail == null)
                            {
                                firstFailureDetail = $"Frame {framesDecrypted} (chunk {chunk.ChunkIndex}, " +
                                    $"offset 0x{chunk.ChunkOffset + offset:X}, size {frameSize}): " +
                                    $"header=0x{header:X4} → ADTS sync detected after decrypt. " +
                                    $"First 8 bytes: {BitConverter.ToString(decrypted, 0, Math.Min(8, decrypted.Length))}";
                            }
                        }

                        framesDecrypted++;
                    }
                    else
                    {
                        framesTooSmall++;
                    }

                    offset += frameSize;
                }
            }

            var decryptSeverity = framesValidationFailed > 0 ? DiagSeverity.Error : DiagSeverity.Ok;
            results.Add(new DiagnosticCheck
            {
                Id = "pipeline-decrypt",
                Title = "Pipeline probe: frame decryption",
                Severity = decryptSeverity,
                Detail = $"Tested {framesDecrypted} frames: {framesValidationPassed} passed, " +
                         $"{framesValidationFailed} FAILED validation, {framesTooSmall} too small to decrypt." +
                         (firstFailureDetail != null ? $"\n  First failure: {firstFailureDetail}" : ""),
                Hint = framesValidationFailed > 0
                    ? "Frames starting with 0xFFF after decryption indicate the AacValidateFilter will throw " +
                      "'Aac error!' causing the pipeline to abort. This could mean: (1) wrong key/IV, " +
                      "(2) the file uses a different encryption scheme, or (3) the fixed-IV CBC mode " +
                      "is incorrect for this content."
                    : null,
            });

            // Stage 3: Check if AavdFilter would throw on first batch
            // The filter buffers 1000 frames. If any frame in the first batch fails,
            // the Encoder task faults. Then subsequent batches are silently dropped
            // because WaitToWriteAsync returns false on a completed channel.
            if (framesValidationFailed == 0 && framesDecrypted > 0)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "pipeline-filter-predict",
                    Title = "Pipeline probe: filter chain prediction",
                    Severity = DiagSeverity.Ok,
                    Detail = $"All {framesDecrypted} test frames pass AacValidateFilter. " +
                             "The decryption pipeline should NOT throw 'Aac error!'. " +
                             "The truncated output bug is likely caused by something else " +
                             "(e.g., stream position issue, early cancellation, or filter chain deadlock).",
                });
            }

            // Stage 4: Check interleaved enumeration (both tracks together)
            if (textTrack is not null)
            {
                int interleavedCount = 0;
                int audioInInterleaved = 0;
                int textInInterleaved = 0;
                try
                {
                    var tracks = new TrakBox[] { audioTrack, textTrack };
                    foreach (var chunk in tracks.InterleaveBy(t => t.ChunkEntries(), t => t.ChunkOffset))
                    {
                        interleavedCount++;
                        if (chunk.TrackId == audioTrack.Tkhd.TrackID) audioInInterleaved++;
                        else textInInterleaved++;
                    }

                    var interleaveSeverity = audioInInterleaved != audioChunkCount ? DiagSeverity.Error : DiagSeverity.Ok;
                    results.Add(new DiagnosticCheck
                    {
                        Id = "pipeline-interleave",
                        Title = "Pipeline probe: interleaved enumeration",
                        Severity = interleaveSeverity,
                        Detail = $"Total: {interleavedCount} chunks. " +
                                 $"Audio: {audioInInterleaved} (expected {audioChunkCount}), " +
                                 $"Text: {textInInterleaved} (expected {textChunkCount}).",
                        Hint = interleaveSeverity == DiagSeverity.Error
                            ? "Mismatch in interleaved enumeration — chunks are being lost in the merge."
                            : null,
                    });
                }
                catch (Exception ex)
                {
                    results.Add(new DiagnosticCheck
                    {
                        Id = "pipeline-interleave",
                        Title = "Pipeline probe: interleaved enumeration",
                        Severity = DiagSeverity.Error,
                        Detail = $"Failed after {interleavedCount} chunks: {ex.GetType().Name}: {ex.Message}",
                    });
                }
            }

            // Stage 5: Measure actual throughput of reading chunks from disk
            var sw = System.Diagnostics.Stopwatch.StartNew();
            int readCount = 0;
            long bytesRead = 0;

            foreach (var chunk in audioTrack.ChunkEntries().Take(1000))
            {
                byte[] buf = new byte[chunk.ChunkSize];
                inputStream.Position = chunk.ChunkOffset;
                await inputStream.ReadExactlyAsync(buf);
                readCount++;
                bytesRead += chunk.ChunkSize;
            }

            sw.Stop();
            double mbPerSec = bytesRead / (1024.0 * 1024) / sw.Elapsed.TotalSeconds;

            results.Add(new DiagnosticCheck
            {
                Id = "pipeline-io-perf",
                Title = "Pipeline probe: I/O performance",
                Severity = DiagSeverity.Ok,
                Detail = $"Read {readCount} chunks ({bytesRead / (1024.0 * 1024):F1} MiB) in {sw.Elapsed.TotalMilliseconds:F0}ms " +
                         $"({mbPerSec:F0} MiB/s). " +
                         $"Estimated full read time for {audioChunkCount} chunks: " +
                         $"{(double)audioChunkCount / readCount * sw.Elapsed.TotalSeconds:F1}s",
            });
        }

        return results;
    }
}
