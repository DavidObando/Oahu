package Oahu.Diagnostics.Checks

import System.Security.Cryptography
import Oahu.Decrypt
import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Chunks
import Oahu.Diagnostics
import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Threading.Tasks

/// Probes the decryption pipeline at each stage to identify where processing fails.
/// Unlike ExportCheck which runs the full pipeline end-to-end, this check manually
/// exercises each component in isolation:
/// 1. Chunk enumeration (are all chunks accessible?)
/// 2. Individual frame decryption (does AES-CBC produce valid AAC?)
/// 3. Frame validation (does AacValidateFilter pass or reject frames?)
/// 4. Full pipeline timing correlation
class PipelineProbeCheck {
    shared {
        func Run(filePath string, key string?, iv string?) List[DiagnosticCheck] {
            return Task
                .Run(
                func () Task[List[DiagnosticCheck]]? {
                    return RunAsync(filePath, key, iv)
                }
            )
                .GetAwaiter()
                .GetResult()
        }

        private async func RunAsync(filePath string, key string?, iv string?) List[DiagnosticCheck] {
            let results = List[DiagnosticCheck]()
            if string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv) {
                results.Add(
                    DiagnosticCheck{
                        Id: "pipeline-prereq",
                        Title: "Pipeline probe prerequisites",
                        Severity: DiagSeverity.Warning,
                        Detail: "Key/IV required for pipeline probe. Skipping."
                    }
                )
                return results
            }
            let keyBytes = Convert.FromHexString(key!!)
            let ivBytes = Convert.FromHexString(iv!!)
            using let inputStream = File.OpenRead(filePath)
            var aaxFile AaxFile
            try {
                aaxFile = AaxFile(inputStream)
            } catch (ex Exception) {
                results.Add(
                    DiagnosticCheck{
                        Id: "pipeline-parse",
                        Title: "Pipeline probe: parse",
                        Severity: DiagSeverity.Error,
                        Detail: "Cannot parse file: ${ex.Message}"
                    }
                )
                return results
            }
            {
                using let _ = aaxFile
                // Stage 1: Enumerate chunks and count them
                let audioTrack = aaxFile.Moov.AudioTrack
                let textTrack TrakBox? = aaxFile.Moov.TextTrack
                var audioChunkCount = 0
                var textChunkCount = 0
                var totalAudioBytes int64 = 0
                var totalAudioFrames int64 = 0
                var totalFirstSampleMax int64 = 0
                try {
                    for chunk in audioTrack.ChunkEntries() {
                        audioChunkCount++
                        totalAudioBytes += int64(chunk.ChunkSize)
                        totalAudioFrames += int64(chunk.FrameSizes.Length)
                        let chunkEnd = chunk.FirstSample + chunk.FrameDurations.Sum((d uint32) -> int64(d))
                        if chunkEnd > totalFirstSampleMax {
                            totalFirstSampleMax = chunkEnd
                        }
                    }
                } catch (ex Exception) {
                    results.Add(
                        DiagnosticCheck{
                            Id: "pipeline-enum-audio",
                            Title: "Pipeline probe: audio chunk enumeration",
                            Severity: DiagSeverity.Error,
                            Detail: "Failed after $audioChunkCount chunks: ${ex.GetType().Name}: ${ex.Message}"
                        }
                    )
                    return results
                }
                if textTrack != nil {
                    try {
                        for chunk in textTrack.ChunkEntries() {
                            textChunkCount++
                        }
                    } catch (ex Exception) {
                        results.Add(
                            DiagnosticCheck{
                                Id: "pipeline-enum-text",
                                Title: "Pipeline probe: text chunk enumeration",
                                Severity: DiagSeverity.Warning,
                                Detail: "Text track enumeration failed: ${ex.Message}"
                            }
                        )
                    }
                }
                // Verify chunk range filtering
                let duration = aaxFile.Duration
                let timeScale = audioTrack.Mdia.Mdhd.Timescale
                let maximumSample = duration.TotalSeconds * float64(timeScale)
                var chunksInRange int64 = 0
                var chunksOutOfRange int64 = 0
                for chunk in audioTrack.ChunkEntries() {
                    let minimumSample float64 = 0.0 // StartTime = Zero
                    let chunkEnd = chunk.FirstSample + chunk.FrameDurations.Sum((d uint32) -> int64(d))
                    let inRange = float64(chunk.FirstSample) <= maximumSample && float64(chunkEnd) >= minimumSample
                    if inRange {
                        chunksInRange++
                    } else {
                        chunksOutOfRange++
                    }
                }
                results.Add(
                    DiagnosticCheck{
                        Id: "pipeline-enum",
                        Title: "Pipeline probe: chunk enumeration",
                        Severity: if chunksOutOfRange > int64(0) {
                            DiagSeverity.Warning
                        } else {
                            DiagSeverity.Ok
                        },
                        Detail: "Audio: ${audioChunkCount:N0} chunks, ${totalAudioFrames:N0} frames, " +
                            "${float64(totalAudioBytes) / (1024.0 * float64(1024.0)):F1} MiB. Text: $textChunkCount chunks. " +
                            "In-range: $chunksInRange, out-of-range: $chunksOutOfRange. " +
                            "Duration: ${duration:hh\:mm\:ss}, MaxSample: ${totalFirstSampleMax:N0}, " +
                            "MaxSampleExpected: ${maximumSample:N0}"
                    }
                )
                // Stage 2: Read and decrypt first N frames manually
                let framesToTest = 5000
                var framesDecrypted = 0
                var framesValidationPassed = 0
                var framesValidationFailed = 0
                var framesTooSmall = 0
                var firstFailureDetail string? = nil
                using let aes = Aes.Create()
                aes.Key = keyBytes
                let firstChunks = audioTrack.ChunkEntries().Take(500).ToList()
                for chunk in firstChunks {
                    if framesDecrypted >= framesToTest {
                        break
                    }
                    // Read chunk data from file
                    let chunkData = [chunk.ChunkSize]uint8
                    inputStream.Position = chunk.ChunkOffset
                    await inputStream.ReadExactlyAsync(chunkData)
                    var offset = 0
                    for var f = 0; f < chunk.FrameSizes.Length && framesDecrypted < framesToTest; f++ {
                        let frameSize = chunk.FrameSizes[f]
                        let frameData = chunkData.AsSpan(offset, frameSize)
                        if frameSize >= 16 {
                            // Decrypt same way as AavdFilter
                            let encSize = frameSize & 0x7FFFFFF0
                            let decrypted = frameData.ToArray()
                            aes.DecryptCbc(
                                decrypted.AsSpan(0, encSize),
                                ivBytes,
                                decrypted.AsSpan(0, encSize),
                                PaddingMode.None
                            )
                            // Validate same way as AacValidateFilter
                            let header = uint16((int32(decrypted[0]) << 8 | int32(decrypted[1])))
                            let valid = (header & uint16(0xFFF0)) != 0xFFF0
                            if valid {
                                framesValidationPassed++
                            } else {
                                framesValidationFailed++
                                if firstFailureDetail == nil {
                                    firstFailureDetail = "Frame $framesDecrypted (chunk ${chunk.ChunkIndex}, " +
                                        "offset 0x${chunk.ChunkOffset + int64(offset):X}, size $frameSize): " +
                                        "header=0x${header:X4} → ADTS sync detected after decrypt. " +
                                        "First 8 bytes: ${BitConverter.ToString(decrypted, 0, Math.Min(8, decrypted.Length))}"
                                }
                            }
                            framesDecrypted++
                        } else {
                            framesTooSmall++
                        }
                        offset += frameSize
                    }
                }
                let decryptSeverity = if framesValidationFailed > 0 {
                    DiagSeverity.Error
                } else {
                    DiagSeverity.Ok
                }
                results.Add(
                    DiagnosticCheck{
                        Id: "pipeline-decrypt",
                        Title: "Pipeline probe: frame decryption",
                        Severity: decryptSeverity,
                        Detail: "Tested $framesDecrypted frames: $framesValidationPassed passed, " +
                            "$framesValidationFailed FAILED validation, $framesTooSmall too small to decrypt." +
                            (
                            if firstFailureDetail != nil {
                                (`
  First failure: ` + "$firstFailureDetail")
                            } else {
                                ""
                            }
                        ),
                        Hint: if framesValidationFailed > 0 {
                            "Frames starting with 0xFFF after decryption indicate the AacValidateFilter will throw " +
                                "'Aac error!' causing the pipeline to abort. This could mean: (1) wrong key/IV, " +
                                "(2) the file uses a different encryption scheme, or (3) the fixed-IV CBC mode " +
                                "is incorrect for this content."
                        } else {
                            default(string?)
                        }
                    }
                )
                // Stage 3: Check if AavdFilter would throw on first batch
                // The filter buffers 1000 frames. If any frame in the first batch fails,
                // the Encoder task faults. Then subsequent batches are silently dropped
                // because WaitToWriteAsync returns false on a completed channel.
                if framesValidationFailed == 0 && framesDecrypted > 0 {
                    results.Add(
                        DiagnosticCheck{
                            Id: "pipeline-filter-predict",
                            Title: "Pipeline probe: filter chain prediction",
                            Severity: DiagSeverity.Ok,
                            Detail: "All $framesDecrypted test frames pass AacValidateFilter. " +
                                "The decryption pipeline should NOT throw 'Aac error!'. " +
                                "The truncated output bug is likely caused by something else " +
                                "(e.g., stream position issue, early cancellation, or filter chain deadlock)."
                        }
                    )
                }
                // Stage 4: Check interleaved enumeration (both tracks together)
                if textTrack != nil {
                    var interleavedCount = 0
                    var audioInInterleaved = 0
                    var textInInterleaved = 0
                    try {
                        let tracks = []TrakBox{audioTrack, textTrack}
                        for chunk in tracks.InterleaveBy(
                            (t TrakBox) -> t.ChunkEntries(),
                            (t ChunkEntry) -> t.ChunkOffset
                        ) {
                            interleavedCount++
                            if chunk.TrackId == audioTrack.Tkhd.TrackID {
                                audioInInterleaved++
                            } else {
                                textInInterleaved++
                            }
                        }
                        let interleaveSeverity = if audioInInterleaved != audioChunkCount {
                            DiagSeverity.Error
                        } else {
                            DiagSeverity.Ok
                        }
                        results.Add(
                            DiagnosticCheck{
                                Id: "pipeline-interleave",
                                Title: "Pipeline probe: interleaved enumeration",
                                Severity: interleaveSeverity,
                                Detail: "Total: $interleavedCount chunks. " +
                                    "Audio: $audioInInterleaved (expected $audioChunkCount), " +
                                    "Text: $textInInterleaved (expected $textChunkCount).",
                                Hint: if interleaveSeverity == DiagSeverity.Error {
                                    "Mismatch in interleaved enumeration — chunks are being lost in the merge."
                                } else {
                                    default(string?)
                                }
                            }
                        )
                    } catch (ex Exception) {
                        results.Add(
                            DiagnosticCheck{
                                Id: "pipeline-interleave",
                                Title: "Pipeline probe: interleaved enumeration",
                                Severity: DiagSeverity.Error,
                                Detail: "Failed after $interleavedCount chunks: ${ex.GetType().Name}: ${ex.Message}"
                            }
                        )
                    }
                }
                // Stage 5: Measure actual throughput of reading chunks from disk
                let sw = Stopwatch.StartNew()
                var readCount = 0
                var bytesRead int64 = 0
                for chunk in audioTrack.ChunkEntries().Take(1000) {
                    let buf = [chunk.ChunkSize]uint8
                    inputStream.Position = chunk.ChunkOffset
                    await inputStream.ReadExactlyAsync(buf)
                    readCount++
                    bytesRead += int64(chunk.ChunkSize)
                }
                sw.Stop()
                let mbPerSec = float64(bytesRead) / (1024.0 * float64(1024.0)) / sw.Elapsed.TotalSeconds
                results.Add(
                    DiagnosticCheck{
                        Id: "pipeline-io-perf",
                        Title: "Pipeline probe: I/O performance",
                        Severity: DiagSeverity.Ok,
                        Detail: "Read $readCount chunks (${float64(bytesRead) / (1024.0 * float64(1024.0)):F1} MiB) in ${sw.Elapsed.TotalMilliseconds:F0}ms " +
                            "(${mbPerSec:F0} MiB/s). " +
                            "Estimated full read time for $audioChunkCount chunks: " +
                            "${float64(audioChunkCount) / float64(readCount) * sw.Elapsed.TotalSeconds:F1}s"
                    }
                )
            }
            return results
        }
    }
}
