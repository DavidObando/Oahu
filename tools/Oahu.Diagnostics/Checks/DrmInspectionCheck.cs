using Oahu.Decrypt;
using Oahu.Decrypt.Mpeg4.Boxes;

namespace Oahu.Diagnostics.Checks;

/// <summary>
/// Inspects DRM-related boxes in the encrypted file:
/// - For AAX: looks for the adrm box (activation-bytes path)
/// - For AAXC: looks for sinf/tenc boxes (CENC key-based path)
/// - For Dash: looks for sinf/tenc + pssh boxes
/// Reports presence/absence and key identifiers (not secrets).
/// </summary>
public static class DrmInspectionCheck
{
    public static List<DiagnosticCheck> Run(string filePath)
    {
        var results = new List<DiagnosticCheck>();

        try
        {
            using var stream = File.OpenRead(filePath);
            using var mp4 = new Mp4File(stream);

            switch (mp4.FileType)
            {
                case FileType.Aax:
                    InspectAax(mp4, results);
                    break;
                case FileType.Aaxc:
                    InspectAaxc(mp4, results);
                    break;
                case FileType.Dash:
                    InspectDash(mp4, results);
                    break;
                default:
                    results.Add(new DiagnosticCheck
                    {
                        Id = "drm-type",
                        Title = "DRM scheme",
                        Severity = DiagSeverity.Warning,
                        Detail = $"File type '{mp4.FileType}' — no DRM expected. This may be an already-decrypted file.",
                    });
                    break;
            }
        }
        catch (Exception ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "drm-inspection",
                Title = "DRM inspection",
                Severity = DiagSeverity.Error,
                Detail = $"Failed to inspect DRM metadata: {ex.GetType().Name}: {ex.Message}",
                Hint = "The file may be truncated. See MPEG-4 structure checks.",
            });
        }

        return results;
    }

    private static void InspectAax(Mp4File mp4, List<DiagnosticCheck> results)
    {
        var adrm = mp4.AudioSampleEntry.GetChild<AdrmBox>();
        if (adrm is null)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "drm-adrm",
                Title = "AAX adrm box",
                Severity = DiagSeverity.Error,
                Detail = "Missing adrm box in AudioSampleEntry — cannot decrypt without activation bytes.",
                Hint = "The file may be corrupt or already processed.",
            });
        }
        else
        {
            results.Add(new DiagnosticCheck
            {
                Id = "drm-adrm",
                Title = "AAX adrm box",
                Severity = DiagSeverity.Ok,
                Detail = "adrm box present — file uses activation-byte DRM scheme.",
            });
        }
    }

    private static void InspectAaxc(Mp4File mp4, List<DiagnosticCheck> results)
    {
        // AAXC uses a direct key/IV from the Audible license voucher.
        // The audio sample entry type is 'aavd' (Audible audio video data).
        var sampleType = mp4.AudioSampleEntry.Header.Type;

        results.Add(new DiagnosticCheck
        {
            Id = "drm-scheme",
            Title = "AAXC DRM scheme",
            Severity = DiagSeverity.Ok,
            Detail = $"AAXC file with audio sample entry type '{sampleType}' — uses license key/IV for decryption.",
        });

        // Check if there's a sinf box (some AAXC variants may have one)
        var sinf = mp4.AudioSampleEntry.GetChild<SinfBox>();
        if (sinf is not null)
        {
            var tenc = sinf.SchemeInformation?.TrackEncryption;
            var detail = tenc is not null
                ? $"sinf/tenc present, DefaultKID={tenc.DefaultKID}"
                : "sinf present but no tenc box found.";

            results.Add(new DiagnosticCheck
            {
                Id = "drm-sinf",
                Title = "AAXC sinf/tenc boxes",
                Severity = DiagSeverity.Ok,
                Detail = detail,
            });
        }
        else
        {
            results.Add(new DiagnosticCheck
            {
                Id = "drm-sinf",
                Title = "AAXC sinf/tenc boxes",
                Severity = DiagSeverity.Ok,
                Detail = "No sinf box — standard AAXC direct key/IV mode (expected for most Audible content).",
            });
        }
    }

    private static void InspectDash(Mp4File mp4, List<DiagnosticCheck> results)
    {
        var sinf = mp4.AudioSampleEntry.GetChild<SinfBox>();
        if (sinf is null)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "drm-dash",
                Title = "Dash CENC encryption",
                Severity = DiagSeverity.Warning,
                Detail = "Dash file but no sinf box found — file may already be decrypted.",
            });
            return;
        }

        var schemeType = sinf.SchemeType?.Type.ToString() ?? "unknown";
        var tenc = sinf.SchemeInformation?.TrackEncryption;
        var keyInfo = tenc is not null
            ? $"DefaultKID={tenc.DefaultKID}"
            : "no tenc box";

        results.Add(new DiagnosticCheck
        {
            Id = "drm-dash",
            Title = "Dash CENC encryption",
            Severity = DiagSeverity.Ok,
            Detail = $"Scheme={schemeType}, {keyInfo}",
        });
    }
}
