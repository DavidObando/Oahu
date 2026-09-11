package Oahu.Diagnostics.Checks

import Oahu.Decrypt
import Oahu.Diagnostics
import System
import System.Collections.Generic
import System.IO

/// Opens the file as an Mp4File (or AaxFile) and reports audio metadata:
/// file type, codec, sample rate, bitrate, channels, duration.
class AudioMetadataCheck {
    shared {
        func Run(filePath string) List[DiagnosticCheck] {
            let results = List[DiagnosticCheck]()
            try {
                using let stream = File.OpenRead(filePath)
                using let mp4 = Mp4File(stream)
                results.Add(
                    DiagnosticCheck{
                        Id: "audio-filetype",
                        Title: "Detected file type",
                        Severity: DiagSeverity.Ok,
                        Detail: mp4.FileType.ToString()
                    }
                )
                results.Add(
                    DiagnosticCheck{
                        Id: "audio-duration",
                        Title: "Audio duration",
                        Severity: if mp4.Duration.TotalSeconds > float64(0.0) {
                            DiagSeverity.Ok
                        } else {
                            DiagSeverity.Warning
                        },
                        Detail: if mp4.Duration.TotalSeconds > float64(0.0) {
                            "${mp4.Duration:hh\:mm\:ss} (${mp4.Duration.TotalSeconds:F1}s)"
                        } else {
                            "Duration is zero or negative — metadata may be corrupt."
                        }
                    }
                )
                results.Add(
                    DiagnosticCheck{
                        Id: "audio-samplerate",
                        Title: "Sample rate",
                        Severity: DiagSeverity.Ok,
                        Detail: "${mp4.TimeScale} Hz"
                    }
                )
                results.Add(
                    DiagnosticCheck{
                        Id: "audio-channels",
                        Title: "Audio channels",
                        Severity: if mp4.AudioChannels > 0 {
                            DiagSeverity.Ok
                        } else {
                            DiagSeverity.Warning
                        },
                        Detail: switch mp4.AudioChannels {
                            case 1: "1 (Mono)"
                            case 2: "2 (Stereo)"
                            case var n: "$n"
                        }
                    }
                )
                results.Add(
                    DiagnosticCheck{
                        Id: "audio-bitrate",
                        Title: "Max bitrate",
                        Severity: DiagSeverity.Ok,
                        Detail: if mp4.MaxBitrate > 0 {
                            "${mp4.MaxBitrate / 1000} kbps"
                        } else {
                            "Unknown (not in metadata)"
                        }
                    }
                )
            } catch (ex Exception) {
                results.Add(
                    DiagnosticCheck{
                        Id: "audio-metadata",
                        Title: "Audio metadata extraction",
                        Severity: DiagSeverity.Error,
                        Detail: "Failed to read audio metadata: ${ex.GetType().Name}: ${ex.Message}",
                        Hint: "The file may be truncated or corrupt. Check the MPEG-4 structure results above."
                    }
                )
            }
            return results
        }
    }
}
