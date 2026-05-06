using Oahu.Decrypt;
using Oahu.Decrypt.Mpeg4.Boxes;
using Oahu.Decrypt.Mpeg4.Chunks;

namespace Oahu.Diagnostics.Checks;

/// <summary>
/// Deep inspection of the MPEG-4 internal structure relevant to decryption:
/// - Track layout (audio/text tracks)
/// - Chunk/sample table statistics
/// - Chunk offset ranges vs mdat bounds
/// - Frame size distribution
///
/// This helps diagnose issues where the file parses correctly but decryption
/// produces truncated output (e.g., chunk offsets pointing outside mdat).
/// </summary>
public static class DeepStructureCheck
{
    public static List<DiagnosticCheck> Run(string filePath)
    {
        var results = new List<DiagnosticCheck>();

        try
        {
            using var stream = File.OpenRead(filePath);
            var fileSize = stream.Length;
            using var mp4 = new Mp4File(stream);

            // Report top-level box positions and sizes
            var mdatHeader = mp4.Mdat.Header;
            long mdatDataStart = GetMdatDataStart(mp4);
            long mdatDataEnd = mdatDataStart + (long)mdatHeader.TotalBoxSize - mdatHeader.HeaderSize;

            results.Add(new DiagnosticCheck
            {
                Id = "deep-mdat-bounds",
                Title = "mdat data bounds",
                Severity = DiagSeverity.Ok,
                Detail = $"mdat header size={mdatHeader.HeaderSize}, total box size={mdatHeader.TotalBoxSize:N0}, " +
                         $"data range: [{mdatDataStart:N0} .. {mdatDataEnd:N0}], file size={fileSize:N0}",
            });

            // Audio track info
            var audioTrack = mp4.Moov.AudioTrack;
            if (audioTrack is null)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "deep-audio-track",
                    Title = "Audio track",
                    Severity = DiagSeverity.Error,
                    Detail = "No audio track found in moov box.",
                });
                return results;
            }

            var stbl = audioTrack.Mdia.Minf.Stbl;
            var coBox = stbl.COBox;
            var stszBox = stbl.Stsz;
            var sttsBox = stbl.Stts;
            var stscBox = stbl.Stsc;

            results.Add(new DiagnosticCheck
            {
                Id = "deep-audio-track",
                Title = "Audio track structure",
                Severity = DiagSeverity.Ok,
                Detail = $"TrackID={audioTrack.Tkhd.TrackID}, " +
                         $"Timescale={audioTrack.Mdia.Mdhd.Timescale}, " +
                         $"Duration={audioTrack.Mdia.Mdhd.Duration} samples, " +
                         $"Chunks={coBox.EntryCount}, " +
                         $"SampleCount={stszBox?.SampleCount ?? 0}, " +
                         $"TotalSampleBytes={stszBox?.TotalSize ?? 0:N0}",
            });

            // Chunk offset analysis
            var chunkOffsets = coBox.ChunkOffsets;
            uint chunkCount = coBox.EntryCount;

            if (chunkCount == 0)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "deep-chunk-offsets",
                    Title = "Chunk offsets",
                    Severity = DiagSeverity.Error,
                    Detail = "Audio track has 0 chunks — no audio data to decode.",
                });
                return results;
            }

            long firstOffset = chunkOffsets.GetOffsetAtIndex(0);
            long lastOffset = chunkOffsets.GetOffsetAtIndex((int)chunkCount - 1);

            bool firstInBounds = firstOffset >= mdatDataStart && firstOffset < mdatDataEnd;
            bool lastInBounds = lastOffset >= mdatDataStart && lastOffset < mdatDataEnd;

            var offsetSeverity = (firstInBounds && lastInBounds) ? DiagSeverity.Ok
                : (!firstInBounds && !lastInBounds) ? DiagSeverity.Error
                : DiagSeverity.Warning;

            results.Add(new DiagnosticCheck
            {
                Id = "deep-chunk-offsets",
                Title = "Chunk offsets vs mdat bounds",
                Severity = offsetSeverity,
                Detail = $"First chunk offset={firstOffset:N0} (in mdat: {firstInBounds}), " +
                         $"Last chunk offset={lastOffset:N0} (in mdat: {lastInBounds}), " +
                         $"mdat range=[{mdatDataStart:N0}..{mdatDataEnd:N0}]",
                Hint = offsetSeverity != DiagSeverity.Ok
                    ? "Chunk offsets outside mdat indicate the file is corrupt or was incompletely downloaded."
                    : null,
            });

            // Enumerate a sample of chunks to check sizes
            try
            {
                var chunkEntries = new ChunkEntryList(audioTrack);
                int totalChunks = 0;
                long totalFrameBytes = 0;
                int totalFrames = 0;
                int chunksOutOfBounds = 0;
                int chunksWithZeroSize = 0;

                foreach (var chunk in chunkEntries)
                {
                    totalChunks++;
                    totalFrameBytes += chunk.ChunkSize;
                    totalFrames += chunk.FrameSizes.Length;

                    if (chunk.ChunkOffset < mdatDataStart || chunk.ChunkOffset >= mdatDataEnd)
                    {
                        chunksOutOfBounds++;
                    }

                    if (chunk.ChunkSize == 0)
                    {
                        chunksWithZeroSize++;
                    }
                }

                var chunkSeverity = chunksOutOfBounds > 0 ? DiagSeverity.Error
                    : chunksWithZeroSize > 0 ? DiagSeverity.Warning
                    : DiagSeverity.Ok;

                results.Add(new DiagnosticCheck
                {
                    Id = "deep-chunk-enum",
                    Title = "Chunk enumeration",
                    Severity = chunkSeverity,
                    Detail = $"Enumerated {totalChunks} chunks, {totalFrames:N0} frames, " +
                             $"{totalFrameBytes:N0} bytes total frame data. " +
                             $"Out-of-bounds={chunksOutOfBounds}, Zero-size={chunksWithZeroSize}.",
                    Hint = chunkSeverity != DiagSeverity.Ok
                        ? $"{chunksOutOfBounds} chunks have offsets outside the mdat box — data is missing or file is truncated."
                        : null,
                });

                // Frame size distribution
                if (totalFrames > 0)
                {
                    var avgFrameSize = totalFrameBytes / (double)totalFrames;
                    results.Add(new DiagnosticCheck
                    {
                        Id = "deep-frame-stats",
                        Title = "Frame statistics",
                        Severity = DiagSeverity.Ok,
                        Detail = $"Avg frame size={avgFrameSize:F0} bytes, " +
                                 $"Expected audio data={totalFrameBytes / (1024.0 * 1024):F2} MiB",
                    });
                }
            }
            catch (Exception ex)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "deep-chunk-enum",
                    Title = "Chunk enumeration",
                    Severity = DiagSeverity.Error,
                    Detail = $"Failed to enumerate chunks: {ex.GetType().Name}: {ex.Message}",
                });
            }

            // Text track (chapters)
            if (mp4.Moov.TextTrack is TrakBox textTrack)
            {
                var textCo = textTrack.Mdia.Minf.Stbl.COBox;
                results.Add(new DiagnosticCheck
                {
                    Id = "deep-text-track",
                    Title = "Text track (chapters)",
                    Severity = DiagSeverity.Ok,
                    Detail = $"TrackID={textTrack.Tkhd.TrackID}, Chunks={textCo.EntryCount}",
                });
            }
            else
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "deep-text-track",
                    Title = "Text track (chapters)",
                    Severity = DiagSeverity.Ok,
                    Detail = "No text track present.",
                });
            }

            // Check stts (sample-to-time) table for the audio track
            try
            {
                var sttsEntries = sttsBox.Samples;
                long totalSampleDuration = 0;
                foreach (var entry in sttsEntries)
                {
                    totalSampleDuration += (long)entry.FrameCount * entry.FrameDelta;
                }

                var derivedDuration = TimeSpan.FromSeconds((double)totalSampleDuration / audioTrack.Mdia.Mdhd.Timescale);

                results.Add(new DiagnosticCheck
                {
                    Id = "deep-stts",
                    Title = "Sample-to-time table (stts)",
                    Severity = DiagSeverity.Ok,
                    Detail = $"Entries={sttsEntries.Count}, " +
                             $"Total sample duration={totalSampleDuration} ({derivedDuration:hh\\:mm\\:ss})",
                });
            }
            catch (Exception ex)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "deep-stts",
                    Title = "Sample-to-time table (stts)",
                    Severity = DiagSeverity.Error,
                    Detail = $"Failed to read stts: {ex.GetType().Name}: {ex.Message}",
                });
            }

            // Check sample size box (stsz)
            if (stszBox is not null)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "deep-stsz",
                    Title = "Sample size table (stsz)",
                    Severity = DiagSeverity.Ok,
                    Detail = $"SampleCount={stszBox.SampleCount}, " +
                             $"TotalSize={stszBox.TotalSize:N0} bytes, MaxSize={stszBox.MaxSize}",
                });
            }
        }
        catch (Exception ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "deep-structure",
                Title = "Deep structure analysis",
                Severity = DiagSeverity.Error,
                Detail = $"Failed: {ex.GetType().Name}: {ex.Message}",
            });
        }

        return results;
    }

    private static long GetMdatDataStart(Mp4File mp4)
    {
        // Walk top-level boxes to find the file offset where mdat's data begins.
        // mdat's header is at some file position; data starts after the header.
        long pos = 0;
        foreach (var box in mp4.TopLevelBoxes)
        {
            if (box == mp4.Mdat)
            {
                return pos + box.Header.HeaderSize;
            }

            pos += (long)box.Header.TotalBoxSize;
        }

        // Fallback: can't determine
        return 0;
    }
}
