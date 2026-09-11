package Oahu.Diagnostics

import Oahu.Diagnostics.Checks
import System
import System.Collections.Generic
import System.IO
import System.Linq

/// Orchestrates all diagnostic checks in the correct order, stopping early when fatal.
class DiagnosticRunner {
    func Run(filePath string, key string? = nil, iv string? = nil) DiagnosticReport {
        let checks = List[DiagnosticCheck]()
        // Phase 1: File integrity — if this fails, nothing else makes sense.
        let fileCheck = FileIntegrityCheck.Run(filePath)
        checks.Add(fileCheck)
        if fileCheck.Severity == DiagSeverity.Error {
            return BuildReport(filePath, checks)
        }
        // Phase 2: MPEG-4 structure — parse the container to see if download was complete.
        let structureChecks = Mpeg4StructureCheck.Run(filePath)
        checks.AddRange(structureChecks)
        // If basic parsing failed, skip higher-level checks.
        if structureChecks.Any((c DiagnosticCheck) -> c.Id == "mpeg4-parse" && c.Severity == DiagSeverity.Error) {
            return BuildReport(filePath, checks)
        }
        // Phase 3: Audio metadata — requires successful moov parsing.
        if !structureChecks.Any((c DiagnosticCheck) -> c.Id == "mpeg4-moov" && c.Severity == DiagSeverity.Error) {
            let metadataChecks = AudioMetadataCheck.Run(filePath)
            checks.AddRange(metadataChecks)
        }
        // Phase 4: DRM inspection — what encryption scheme is in use?
        let drmChecks = DrmInspectionCheck.Run(filePath)
        checks.AddRange(drmChecks)
        // Phase 5: Decryption probe (optional, only if key/IV provided).
        let decryptChecks = DecryptionProbeCheck.Run(filePath, key, iv)
        checks.AddRange(decryptChecks)
        return BuildReport(filePath, checks)
    }

    /// Runs a full export attempt: decrypt the file and write to .m4b.
    /// Includes file integrity and structure checks, then performs the export.
    func RunExport(
        filePath string,
        key string?,
        iv string?,
        asin string?,
        dbPath string?,
        outputPath string?
    ) DiagnosticReport {
        var key = key
        var iv = iv
        var asin = asin
        let checks = List[DiagnosticCheck]()
        // Phase 1: File integrity
        let fileCheck = FileIntegrityCheck.Run(filePath)
        checks.Add(fileCheck)
        if fileCheck.Severity == DiagSeverity.Error {
            return BuildReport(filePath, checks)
        }
        // Phase 2: Deep structure analysis (before key resolution)
        let deepChecks = DeepStructureCheck.Run(filePath)
        checks.AddRange(deepChecks)
        // Phase 3: Resolve key/IV (from args or database)
        if string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv) {
            // Try to load from database
            if string.IsNullOrWhiteSpace(asin) {
                // Try to extract ASIN from filename (convention: Title_ASIN_...)
                asin = ExtractAsinFromFilename(filePath)
            }
            if !string.IsNullOrWhiteSpace(asin) {
                let (dbCheck, dbKey, dbIv) = DatabaseKeyLookup.LookupKey(asin, dbPath)
                checks.Add(dbCheck)
                if dbCheck.Severity == DiagSeverity.Error {
                    return BuildReport(filePath, checks)
                }
                key ??= dbKey
                iv ??= dbIv
            } else {
                checks.Add(
                    DiagnosticCheck{
                        Id: "export-key-resolve",
                        Title: "Resolve decryption credentials",
                        Severity: DiagSeverity.Error,
                        Detail: "No key/IV provided and could not determine ASIN from filename for database lookup.",
                        Hint: "Pass --key and --iv explicitly, or pass --asin to look up from the library database."
                    }
                )
                return BuildReport(filePath, checks)
            }
        }
        // Phase 4: Pipeline probe — test individual stages in isolation
        let pipelineChecks = PipelineProbeCheck.Run(filePath, key, iv)
        checks.AddRange(pipelineChecks)
        // Phase 5: Instrumented export — detailed pipeline execution tracking
        let instrumentedOutputPath = if outputPath != nil {
            Path.ChangeExtension(outputPath, ".instrumented.m4b")
        } else {
            Path.ChangeExtension(filePath, ".instrumented.m4b")
        }
        let instrumentedChecks = InstrumentedExportCheck.Run(filePath, key, iv, instrumentedOutputPath)
        checks.AddRange(instrumentedChecks)
        // Phase 6: Run the full export
        let exportChecks = ExportCheck.Run(filePath, key, iv, outputPath)
        checks.AddRange(exportChecks)
        return BuildReport(filePath, checks)
    }

    shared {
        private func ExtractAsinFromFilename(filePath string) string? {
            // Convention: Title_ASIN_Codec_Bitrate_SampleRate.aaxc
            // e.g. "#GIRLBOSS_B00K36M20C_LC_64_22050.aaxc"
            let fileName = Path.GetFileNameWithoutExtension(filePath)
            let parts = fileName.Split('_')
            // ASIN is typically the second part and starts with B0 (10 chars)
            for part in parts {
                if part.Length == 10 && part.StartsWith("B0", StringComparison.OrdinalIgnoreCase) {
                    return part
                }
            }
            return nil
        }

        private func BuildReport(filePath string, checks List[DiagnosticCheck]) DiagnosticReport {
            return DiagnosticReport{FilePath: filePath, Timestamp: DateTimeOffset.UtcNow, Checks: checks}
        }
    }
}
