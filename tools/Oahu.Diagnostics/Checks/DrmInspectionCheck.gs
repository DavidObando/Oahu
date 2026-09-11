package Oahu.Diagnostics.Checks

import Oahu.Decrypt
import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Diagnostics
import System
import System.Collections.Generic
import System.IO

/// Inspects DRM-related boxes in the encrypted file:
/// - For AAX: looks for the adrm box (activation-bytes path)
/// - For AAXC: looks for sinf/tenc boxes (CENC key-based path)
/// - For Dash: looks for sinf/tenc + pssh boxes
/// Reports presence/absence and key identifiers (not secrets).
class DrmInspectionCheck {
    shared {
        func Run(filePath string) List[DiagnosticCheck] {
            let results = List[DiagnosticCheck]()
            try {
                using let stream = File.OpenRead(filePath)
                using let mp4 = Mp4File(stream)
                switch mp4.FileType {
                    case FileType.Aax {
                        InspectAax(mp4, results)
                    }
                    case FileType.Aaxc {
                        InspectAaxc(mp4, results)
                    }
                    case FileType.Dash {
                        InspectDash(mp4, results)
                    }
                    default {
                        results.Add(
                            DiagnosticCheck{
                                Id: "drm-type",
                                Title: "DRM scheme",
                                Severity: DiagSeverity.Warning,
                                Detail: "File type '${mp4.FileType}' — no DRM expected. This may be an already-decrypted file."
                            }
                        )
                    }
                }
            } catch (ex Exception) {
                results.Add(
                    DiagnosticCheck{
                        Id: "drm-inspection",
                        Title: "DRM inspection",
                        Severity: DiagSeverity.Error,
                        Detail: "Failed to inspect DRM metadata: ${ex.GetType().Name}: ${ex.Message}",
                        Hint: "The file may be truncated. See MPEG-4 structure checks."
                    }
                )
            }
            return results
        }

        private func InspectAax(mp4 Mp4File, results List[DiagnosticCheck]) {
            let adrm AdrmBox? = mp4.AudioSampleEntry.GetChild[AdrmBox]()
            if adrm == nil {
                results.Add(
                    DiagnosticCheck{
                        Id: "drm-adrm",
                        Title: "AAX adrm box",
                        Severity: DiagSeverity.Error,
                        Detail: "Missing adrm box in AudioSampleEntry — cannot decrypt without activation bytes.",
                        Hint: "The file may be corrupt or already processed."
                    }
                )
            } else {
                results.Add(
                    DiagnosticCheck{
                        Id: "drm-adrm",
                        Title: "AAX adrm box",
                        Severity: DiagSeverity.Ok,
                        Detail: "adrm box present — file uses activation-byte DRM scheme."
                    }
                )
            }
        }

        private func InspectAaxc(mp4 Mp4File, results List[DiagnosticCheck]) {
            // AAXC uses a direct key/IV from the Audible license voucher.
            // The audio sample entry type is 'aavd' (Audible audio video data).
            let sampleType = mp4.AudioSampleEntry.Header.Type
            results.Add(
                DiagnosticCheck{
                    Id: "drm-scheme",
                    Title: "AAXC DRM scheme",
                    Severity: DiagSeverity.Ok,
                    Detail: "AAXC file with audio sample entry type '$sampleType' — uses license key/IV for decryption."
                }
            )
            // Check if there's a sinf box (some AAXC variants may have one)
            let sinf SinfBox? = mp4.AudioSampleEntry.GetChild[SinfBox]()
            if sinf != nil {
                let tenc TencBox? = sinf.SchemeInformation?.TrackEncryption
                let detail = if tenc != nil {
                    "sinf/tenc present, DefaultKID=${tenc.DefaultKID}"
                } else {
                    "sinf present but no tenc box found."
                }
                results.Add(
                    DiagnosticCheck{
                        Id: "drm-sinf",
                        Title: "AAXC sinf/tenc boxes",
                        Severity: DiagSeverity.Ok,
                        Detail: detail
                    }
                )
            } else {
                results.Add(
                    DiagnosticCheck{
                        Id: "drm-sinf",
                        Title: "AAXC sinf/tenc boxes",
                        Severity: DiagSeverity.Ok,
                        Detail: "No sinf box — standard AAXC direct key/IV mode (expected for most Audible content)."
                    }
                )
            }
        }

        private func InspectDash(mp4 Mp4File, results List[DiagnosticCheck]) {
            let sinf SinfBox? = mp4.AudioSampleEntry.GetChild[SinfBox]()
            if sinf == nil {
                results.Add(
                    DiagnosticCheck{
                        Id: "drm-dash",
                        Title: "Dash CENC encryption",
                        Severity: DiagSeverity.Warning,
                        Detail: "Dash file but no sinf box found — file may already be decrypted."
                    }
                )
                return
            }
            let schemeType = sinf.SchemeType?.Type.ToString() ?? "unknown"
            let tenc TencBox? = sinf.SchemeInformation?.TrackEncryption
            let keyInfo = if tenc != nil {
                "DefaultKID=${tenc.DefaultKID}"
            } else {
                "no tenc box"
            }
            results.Add(
                DiagnosticCheck{
                    Id: "drm-dash",
                    Title: "Dash CENC encryption",
                    Severity: DiagSeverity.Ok,
                    Detail: "Scheme=$schemeType, $keyInfo"
                }
            )
        }
    }
}
