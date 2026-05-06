using Oahu.Decrypt;

namespace Oahu.Diagnostics.Checks;

/// <summary>
/// Opens the file as an Mp4File (or AaxFile) and reports audio metadata:
/// file type, codec, sample rate, bitrate, channels, duration.
/// </summary>
public static class AudioMetadataCheck
{
    public static List<DiagnosticCheck> Run(string filePath)
    {
        var results = new List<DiagnosticCheck>();

        try
        {
            using var stream = File.OpenRead(filePath);
            using var mp4 = new Mp4File(stream);

            results.Add(new DiagnosticCheck
            {
                Id = "audio-filetype",
                Title = "Detected file type",
                Severity = DiagSeverity.Ok,
                Detail = mp4.FileType.ToString(),
            });

            results.Add(new DiagnosticCheck
            {
                Id = "audio-duration",
                Title = "Audio duration",
                Severity = mp4.Duration.TotalSeconds > 0 ? DiagSeverity.Ok : DiagSeverity.Warning,
                Detail = mp4.Duration.TotalSeconds > 0
                    ? $"{mp4.Duration:hh\\:mm\\:ss} ({mp4.Duration.TotalSeconds:F1}s)"
                    : "Duration is zero or negative — metadata may be corrupt.",
            });

            results.Add(new DiagnosticCheck
            {
                Id = "audio-samplerate",
                Title = "Sample rate",
                Severity = DiagSeverity.Ok,
                Detail = $"{mp4.TimeScale} Hz",
            });

            results.Add(new DiagnosticCheck
            {
                Id = "audio-channels",
                Title = "Audio channels",
                Severity = mp4.AudioChannels > 0 ? DiagSeverity.Ok : DiagSeverity.Warning,
                Detail = mp4.AudioChannels switch
                {
                    1 => "1 (Mono)",
                    2 => "2 (Stereo)",
                    var n => $"{n}",
                },
            });

            results.Add(new DiagnosticCheck
            {
                Id = "audio-bitrate",
                Title = "Max bitrate",
                Severity = DiagSeverity.Ok,
                Detail = mp4.MaxBitrate > 0
                    ? $"{mp4.MaxBitrate / 1000} kbps"
                    : "Unknown (not in metadata)",
            });
        }
        catch (Exception ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "audio-metadata",
                Title = "Audio metadata extraction",
                Severity = DiagSeverity.Error,
                Detail = $"Failed to read audio metadata: {ex.GetType().Name}: {ex.Message}",
                Hint = "The file may be truncated or corrupt. Check the MPEG-4 structure results above.",
            });
        }

        return results;
    }
}
