package Oahu.Diagnostics.Checks

import Oahu.Decrypt
import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Chunks
import Oahu.Diagnostics
import System
import System.Collections.Generic
import System.IO

/// Deep inspection of the MPEG-4 internal structure relevant to decryption:
/// - Track layout (audio/text tracks)
/// - Chunk/sample table statistics
/// - Chunk offset ranges vs mdat bounds
/// - Frame size distribution
///
/// This helps diagnose issues where the file parses correctly but decryption
/// produces truncated output (e.g., chunk offsets pointing outside mdat).
class DeepStructureCheck {
    shared {
        func Run(filePath string) List[DiagnosticCheck] {
            let results = List[DiagnosticCheck]()
            try {
                using let stream = File.OpenRead(filePath)
                let fileSize = stream.Length
                using let mp4 = Mp4File(stream)
                // Report top-level box positions and sizes
                let mdatHeader = mp4.Mdat.Header
                let mdatDataStart = GetMdatDataStart(mp4)
                let mdatDataEnd = mdatDataStart + int64(mdatHeader.TotalBoxSize) - int64(mdatHeader.HeaderSize)
                results.Add(
                    DiagnosticCheck{
                        Id: "deep-mdat-bounds",
                        Title: "mdat data bounds",
                        Severity: DiagSeverity.Ok,
                        Detail: "mdat header size=${mdatHeader.HeaderSize}, total box size=${mdatHeader.TotalBoxSize:N0}, " +
                            "data range: [${mdatDataStart:N0} .. ${mdatDataEnd:N0}], file size=${fileSize:N0}"
                    }
                )
                // Audio track info
                let audioTrack TrakBox? = mp4.Moov.AudioTrack
                if audioTrack == nil {
                    results.Add(
                        DiagnosticCheck{
                            Id: "deep-audio-track",
                            Title: "Audio track",
                            Severity: DiagSeverity.Error,
                            Detail: "No audio track found in moov box."
                        }
                    )
                    return results
                }
                let stbl = audioTrack.Mdia.Minf.Stbl
                let coBox = stbl.COBox
                let stszBox IStszBox? = stbl.Stsz
                let sttsBox = stbl.Stts
                let stscBox = stbl.Stsc
                results.Add(
                    DiagnosticCheck{
                        Id: "deep-audio-track",
                        Title: "Audio track structure",
                        Severity: DiagSeverity.Ok,
                        Detail: "TrackID=${audioTrack.Tkhd.TrackID}, " +
                            "Timescale=${audioTrack.Mdia.Mdhd.Timescale}, " +
                            "Duration=${audioTrack.Mdia.Mdhd.Duration} samples, " +
                            "Chunks=${coBox.EntryCount}, " +
                            "SampleCount=${stszBox?.SampleCount ?? 0}, " +
                            "TotalSampleBytes=${stszBox?.TotalSize ?? int64(0):N0}"
                    }
                )
                // Chunk offset analysis
                let chunkOffsets = coBox.ChunkOffsets
                let chunkCount = coBox.EntryCount
                if chunkCount == uint32(0) {
                    results.Add(
                        DiagnosticCheck{
                            Id: "deep-chunk-offsets",
                            Title: "Chunk offsets",
                            Severity: DiagSeverity.Error,
                            Detail: "Audio track has 0 chunks — no audio data to decode."
                        }
                    )
                    return results
                }
                let firstOffset = chunkOffsets.GetOffsetAtIndex(0)
                let lastOffset = chunkOffsets.GetOffsetAtIndex(int32(chunkCount) - 1)
                let firstInBounds = firstOffset >= mdatDataStart && firstOffset < mdatDataEnd
                let lastInBounds = lastOffset >= mdatDataStart && lastOffset < mdatDataEnd
                let offsetSeverity = if (firstInBounds && lastInBounds) {
                    DiagSeverity.Ok
                } else {
                    (
                        if (!firstInBounds && !lastInBounds) {
                            DiagSeverity.Error
                        } else {
                            DiagSeverity.Warning
                        }
                    )
                }
                results.Add(
                    DiagnosticCheck{
                        Id: "deep-chunk-offsets",
                        Title: "Chunk offsets vs mdat bounds",
                        Severity: offsetSeverity,
                        Detail: "First chunk offset=${firstOffset:N0} (in mdat: $firstInBounds), " +
                            "Last chunk offset=${lastOffset:N0} (in mdat: $lastInBounds), " +
                            "mdat range=[${mdatDataStart:N0}..${mdatDataEnd:N0}]",
                        Hint: if offsetSeverity != DiagSeverity.Ok {
                            "Chunk offsets outside mdat indicate the file is corrupt or was incompletely downloaded."
                        } else {
                            default(string?)
                        }
                    }
                )
                // Enumerate a sample of chunks to check sizes
                try {
                    let chunkEntries = ChunkEntryList(audioTrack)
                    var totalChunks = 0
                    var totalFrameBytes int64 = 0
                    var totalFrames = 0
                    var chunksOutOfBounds = 0
                    var chunksWithZeroSize = 0
                    for chunk in chunkEntries {
                        totalChunks++
                        totalFrameBytes += int64(chunk.ChunkSize)
                        totalFrames += chunk.FrameSizes.Length
                        if chunk.ChunkOffset < mdatDataStart || chunk.ChunkOffset >= mdatDataEnd {
                            chunksOutOfBounds++
                        }
                        if chunk.ChunkSize == 0 {
                            chunksWithZeroSize++
                        }
                    }
                    let chunkSeverity = if chunksOutOfBounds > 0 {
                        DiagSeverity.Error
                    } else {
                        (
                            if chunksWithZeroSize > 0 {
                                DiagSeverity.Warning
                            } else {
                                DiagSeverity.Ok
                            }
                        )
                    }
                    results.Add(
                        DiagnosticCheck{
                            Id: "deep-chunk-enum",
                            Title: "Chunk enumeration",
                            Severity: chunkSeverity,
                            Detail: "Enumerated $totalChunks chunks, ${totalFrames:N0} frames, " +
                                "${totalFrameBytes:N0} bytes total frame data. " +
                                "Out-of-bounds=$chunksOutOfBounds, Zero-size=$chunksWithZeroSize.",
                            Hint: if chunkSeverity != DiagSeverity.Ok {
                                "$chunksOutOfBounds chunks have offsets outside the mdat box — data is missing or file is truncated."
                            } else {
                                default(string?)
                            }
                        }
                    )
                    // Frame size distribution
                    if totalFrames > 0 {
                        let avgFrameSize = float64(totalFrameBytes) / float64(totalFrames)
                        results.Add(
                            DiagnosticCheck{
                                Id: "deep-frame-stats",
                                Title: "Frame statistics",
                                Severity: DiagSeverity.Ok,
                                Detail: "Avg frame size=${avgFrameSize:F0} bytes, " +
                                    "Expected audio data=${float64(totalFrameBytes) / (1024.0 * float64(1024.0)):F2} MiB"
                            }
                        )
                    }
                } catch (ex Exception) {
                    results.Add(
                        DiagnosticCheck{
                            Id: "deep-chunk-enum",
                            Title: "Chunk enumeration",
                            Severity: DiagSeverity.Error,
                            Detail: "Failed to enumerate chunks: ${ex.GetType().Name}: ${ex.Message}"
                        }
                    )
                }
                // Text track (chapters)
                if mp4.Moov.TextTrack is TrakBox textTrack {
                    let textCo = textTrack.Mdia.Minf.Stbl.COBox
                    results.Add(
                        DiagnosticCheck{
                            Id: "deep-text-track",
                            Title: "Text track (chapters)",
                            Severity: DiagSeverity.Ok,
                            Detail: "TrackID=${textTrack.Tkhd.TrackID}, Chunks=${textCo.EntryCount}"
                        }
                    )
                } else {
                    results.Add(
                        DiagnosticCheck{
                            Id: "deep-text-track",
                            Title: "Text track (chapters)",
                            Severity: DiagSeverity.Ok,
                            Detail: "No text track present."
                        }
                    )
                }
                // Check stts (sample-to-time) table for the audio track
                try {
                    let sttsEntries = sttsBox.Samples
                    var totalSampleDuration int64 = 0
                    for entry in sttsEntries {
                        totalSampleDuration += int64(entry.FrameCount) * int64(entry.FrameDelta)
                    }
                    let derivedDuration = TimeSpan.FromSeconds(
                        float64(totalSampleDuration) / float64(audioTrack.Mdia.Mdhd.Timescale)
                    )
                    results.Add(
                        DiagnosticCheck{
                            Id: "deep-stts",
                            Title: "Sample-to-time table (stts)",
                            Severity: DiagSeverity.Ok,
                            Detail: "Entries=${sttsEntries.Count}, " +
                                "Total sample duration=$totalSampleDuration (${derivedDuration:hh\:mm\:ss})"
                        }
                    )
                } catch (ex Exception) {
                    results.Add(
                        DiagnosticCheck{
                            Id: "deep-stts",
                            Title: "Sample-to-time table (stts)",
                            Severity: DiagSeverity.Error,
                            Detail: "Failed to read stts: ${ex.GetType().Name}: ${ex.Message}"
                        }
                    )
                }
                // Check sample size box (stsz)
                if stszBox != nil {
                    results.Add(
                        DiagnosticCheck{
                            Id: "deep-stsz",
                            Title: "Sample size table (stsz)",
                            Severity: DiagSeverity.Ok,
                            Detail: "SampleCount=${stszBox.SampleCount}, " +
                                "TotalSize=${stszBox.TotalSize:N0} bytes, MaxSize=${stszBox.MaxSize}"
                        }
                    )
                }
            } catch (ex Exception) {
                results.Add(
                    DiagnosticCheck{
                        Id: "deep-structure",
                        Title: "Deep structure analysis",
                        Severity: DiagSeverity.Error,
                        Detail: "Failed: ${ex.GetType().Name}: ${ex.Message}"
                    }
                )
            }
            return results
        }

        private func GetMdatDataStart(mp4 Mp4File) int64 {
            // Walk top-level boxes to find the file offset where mdat's data begins.
            // mdat's header is at some file position; data starts after the header.
            var pos int64 = 0
            for box in mp4.TopLevelBoxes {
                if box == mp4.Mdat {
                    return pos + int64(box.Header.HeaderSize)
                }
                pos += int64(box.Header.TotalBoxSize)
            }
            // Fallback: can't determine
            return 0
        }
    }
}
