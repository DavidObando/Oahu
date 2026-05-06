using Oahu.Diagnostics.Checks;

namespace Oahu.Diagnostics;

/// <summary>Orchestrates all diagnostic checks in the correct order, stopping early when fatal.</summary>
public sealed class DiagnosticRunner
{
    public DiagnosticReport Run(string filePath, string? key = null, string? iv = null)
    {
        var checks = new List<DiagnosticCheck>();

        // Phase 1: File integrity — if this fails, nothing else makes sense.
        var fileCheck = FileIntegrityCheck.Run(filePath);
        checks.Add(fileCheck);

        if (fileCheck.Severity == DiagSeverity.Error)
        {
            return BuildReport(filePath, checks);
        }

        // Phase 2: MPEG-4 structure — parse the container to see if download was complete.
        var structureChecks = Mpeg4StructureCheck.Run(filePath);
        checks.AddRange(structureChecks);

        // If basic parsing failed, skip higher-level checks.
        if (structureChecks.Any(c => c.Id == "mpeg4-parse" && c.Severity == DiagSeverity.Error))
        {
            return BuildReport(filePath, checks);
        }

        // Phase 3: Audio metadata — requires successful moov parsing.
        if (!structureChecks.Any(c => c.Id == "mpeg4-moov" && c.Severity == DiagSeverity.Error))
        {
            var metadataChecks = AudioMetadataCheck.Run(filePath);
            checks.AddRange(metadataChecks);
        }

        // Phase 4: DRM inspection — what encryption scheme is in use?
        var drmChecks = DrmInspectionCheck.Run(filePath);
        checks.AddRange(drmChecks);

        // Phase 5: Decryption probe (optional, only if key/IV provided).
        var decryptChecks = DecryptionProbeCheck.Run(filePath, key, iv);
        checks.AddRange(decryptChecks);

        return BuildReport(filePath, checks);
    }

    /// <summary>
    /// Runs a full export attempt: decrypt the file and write to .m4b.
    /// Includes file integrity and structure checks, then performs the export.
    /// </summary>
    public DiagnosticReport RunExport(string filePath, string? key, string? iv, string? asin, string? dbPath, string? outputPath)
    {
        var checks = new List<DiagnosticCheck>();

        // Phase 1: File integrity
        var fileCheck = FileIntegrityCheck.Run(filePath);
        checks.Add(fileCheck);

        if (fileCheck.Severity == DiagSeverity.Error)
        {
            return BuildReport(filePath, checks);
        }

        // Phase 2: Deep structure analysis (before key resolution)
        var deepChecks = DeepStructureCheck.Run(filePath);
        checks.AddRange(deepChecks);

        // Phase 3: Resolve key/IV (from args or database)
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv))
        {
            // Try to load from database
            if (string.IsNullOrWhiteSpace(asin))
            {
                // Try to extract ASIN from filename (convention: Title_ASIN_...)
                asin = ExtractAsinFromFilename(filePath);
            }

            if (!string.IsNullOrWhiteSpace(asin))
            {
                var (dbCheck, dbKey, dbIv) = DatabaseKeyLookup.LookupKey(asin, dbPath);
                checks.Add(dbCheck);

                if (dbCheck.Severity == DiagSeverity.Error)
                {
                    return BuildReport(filePath, checks);
                }

                key ??= dbKey;
                iv ??= dbIv;
            }
            else
            {
                checks.Add(new DiagnosticCheck
                {
                    Id = "export-key-resolve",
                    Title = "Resolve decryption credentials",
                    Severity = DiagSeverity.Error,
                    Detail = "No key/IV provided and could not determine ASIN from filename for database lookup.",
                    Hint = "Pass --key and --iv explicitly, or pass --asin to look up from the library database.",
                });
                return BuildReport(filePath, checks);
            }
        }

        // Phase 4: Pipeline probe — test individual stages in isolation
        var pipelineChecks = PipelineProbeCheck.Run(filePath, key, iv);
        checks.AddRange(pipelineChecks);

        // Phase 5: Instrumented export — detailed pipeline execution tracking
        var instrumentedOutputPath = outputPath != null
            ? Path.ChangeExtension(outputPath, ".instrumented.m4b")
            : Path.ChangeExtension(filePath, ".instrumented.m4b");
        var instrumentedChecks = InstrumentedExportCheck.Run(filePath, key, iv, instrumentedOutputPath);
        checks.AddRange(instrumentedChecks);

        // Phase 6: Run the full export
        var exportChecks = ExportCheck.Run(filePath, key, iv, outputPath);
        checks.AddRange(exportChecks);

        return BuildReport(filePath, checks);
    }

    private static string? ExtractAsinFromFilename(string filePath)
    {
        // Convention: Title_ASIN_Codec_Bitrate_SampleRate.aaxc
        // e.g. "#GIRLBOSS_B00K36M20C_LC_64_22050.aaxc"
        var fileName = Path.GetFileNameWithoutExtension(filePath);
        var parts = fileName.Split('_');

        // ASIN is typically the second part and starts with B0 (10 chars)
        foreach (var part in parts)
        {
            if (part.Length == 10 && part.StartsWith("B0", StringComparison.OrdinalIgnoreCase))
            {
                return part;
            }
        }

        return null;
    }

    private static DiagnosticReport BuildReport(string filePath, List<DiagnosticCheck> checks)
    {
        return new DiagnosticReport
        {
            FilePath = filePath,
            Timestamp = DateTimeOffset.UtcNow,
            Checks = checks,
        };
    }
}
