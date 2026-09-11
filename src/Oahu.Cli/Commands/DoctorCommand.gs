package Oahu.Cli.Commands

import Microsoft.Extensions.Logging
import Oahu.Cli
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Paths
import System
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.IO
import System.Text.Json
import System.Text.Json.Nodes
import System.Threading
import System.Threading.Tasks

/// `oahu-cli doctor` — environment self-checks.
class DoctorCommand {
    shared {
        func Create(resolveGlobals(ParseResult) -> GlobalOptions, loggerFactory() -> ILoggerFactory) Command {
            let jsonOpt = Option[bool]("--json"){
                Description = "Emit machine-readable JSON instead of the pretty report."
            }
            let skipNetworkOpt = Option[bool]("--skip-network"){
                Description = "Skip the Audible API reachability probe (offline / CI)."
            }
            let fixOpt = Option[bool]("--fix"){
                Description = "(Reserved) attempt to repair recoverable findings. Phase 1 prints what would be fixed."
            }
            let printConfigOpt = Option[bool]("--print-config"){
                Description = "Print the resolved CLI paths (config dir, log dir, token path, lock path) and exit. Useful for support and debugging."
            }
            let fileOpt = Option[string?]("--file"){
                Description = "Path to an encrypted .aaxc/.aax file to diagnose for decryption issues."
            }
            let keyOpt = Option[string?]("--key"){
                Description = "Hex-encoded 16-byte decryption key (used with --file)."
            }
            let ivOpt = Option[string?]("--iv"){
                Description = "Hex-encoded 16-byte initialization vector (used with --file)."
            }
            let asinOpt = Option[string?]("--asin"){
                Description = "Book ASIN for database key lookup (auto-detected from filename if omitted)."
            }
            let dbOpt = Option[string?]("--db"){
                Description = "Path to audiobooks.db for key lookup (auto-detected if omitted)."
            }
            let exportOpt = Option[bool]("--export"){
                Description = "Attempt a full decryption export to .m4b (used with --file)."
            }
            let outputOpt = Option[string?]("--output"){
                Description = "Output .m4b file path when --export is used (defaults to input with .m4b extension)."
            }
            let cmd = Command("doctor", "Run environment self-checks and exit non-zero if any error is found."){
                jsonOpt,
                skipNetworkOpt,
                fixOpt,
                printConfigOpt,
                fileOpt,
                keyOpt,
                ivOpt,
                asinOpt,
                dbOpt,
                exportOpt,
                outputOpt
            }
            cmd.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    if parse.GetValue(printConfigOpt) {
                        PrintResolvedPaths(parse.GetValue(jsonOpt))
                        return ExitCodes.Success
                    }
                    // File diagnostics mode
                    let filePath = parse.GetValue(fileOpt)
                    if !string.IsNullOrWhiteSpace(filePath) {
                        using let lf = loggerFactory()
                        let fileLogger = lf.CreateLogger[FileDiagnosticService]()
                        let fileService = FileDiagnosticService(fileLogger)
                        let fileReport = fileService.Run(
                            FileDiagnosticOptions{
                                FilePath: filePath,
                                Key: parse.GetValue(keyOpt),
                                Iv: parse.GetValue(ivOpt),
                                Asin: parse.GetValue(asinOpt),
                                DatabasePath: parse.GetValue(dbOpt),
                                AttemptExport: parse.GetValue(exportOpt),
                                OutputPath: parse.GetValue(outputOpt)
                            }
                        )
                        if parse.GetValue(jsonOpt) {
                            DoctorRender.Json(fileReport)
                        } else {
                            DoctorRender.Pretty(fileReport, globals)
                        }
                        return if fileReport.HasErrors {
                            ExitCodes.GenericFailure
                        } else {
                            ExitCodes.Success
                        }
                    }
                    using let lf2 = loggerFactory()
                    let logger = lf2.CreateLogger[DoctorService]()
                    let service = DoctorService(logger)
                    let report = await service.RunAsync(DoctorOptions{SkipNetwork: parse.GetValue(skipNetworkOpt)}, ct)
                        .ConfigureAwait(false)
                    if parse.GetValue(jsonOpt) {
                        DoctorRender.Json(report)
                    } else {
                        DoctorRender.Pretty(report, globals)
                    }
                    if parse.GetValue(fixOpt) && report.HasErrors {
                        CliEnvironment.Error.WriteLine()
                        CliEnvironment.Error.WriteLine("--fix is reserved: no auto-repair actions are implemented yet.")
                    }
                    return if report.HasErrors {
                        ExitCodes.GenericFailure
                    } else {
                        ExitCodes.Success
                    }
                }
            )
            return cmd
        }

        private func PrintResolvedPaths(asJson bool) {
            let paths = Dictionary[string, object?](StringComparer.Ordinal){
                ["configDir"] = CliPaths.ConfigDir,
                ["logDir"] = CliPaths.LogDir,
                ["sharedUserDataDir"] = CliPaths.SharedUserDataDir,
                ["defaultDownloadDir"] = CliPaths.DefaultDownloadDir,
                ["serverTokenPath"] = Path.Combine(CliPaths.ConfigDir, "server.token"),
                ["serverLockPath"] = Path.Combine(CliPaths.SharedUserDataDir, "server.lock"),
                ["auditLogPath"] = Path.Combine(CliPaths.SharedUserDataDir, "logs", "server-audit.jsonl")
            }
            if asJson {
                let obj = JsonObject(){["_schemaVersion"] = "1", ["resource"] = "doctor-config"}
                for kv in paths {
                    obj[kv.Key] = JsonValue.Create(kv.Value?.ToString())
                }
                Console.WriteLine(obj.ToJsonString(JsonSerializerOptions{WriteIndented: true}))
                return
            }
            for kv in paths {
                Console.WriteLine("${kv.Key,-22}${kv.Value}")
            }
        }
    }
}
