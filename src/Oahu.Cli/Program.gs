package Oahu.Cli

import System
import System.CommandLine
import System.Threading.Tasks
import Microsoft.Extensions.Logging
import Oahu.Cli.App.Errors
import Oahu.Cli.Commands
import Oahu.Cli.Logging
import Oahu.Cli.App.Core
import Oahu.Cli.Tui.Logging

/// Entry point for `oahu-cli`.
///
/// Phase 1 deliverables (see `docs/OAHU_CLI_DESIGN.md` §Phase 1):
/// • `--version`, `--help`
/// • `oahu-cli doctor`
/// • Process setup: NO_COLOR / FORCE_COLOR, UTF-8, redirect detection, exit-trap
/// • Daily-rotating file logger
/// • TUI placeholder (refuses to enter, returns a clear "not yet implemented" message)
class Program {
    shared {
        async func Main(args[]string) int32 {
            CliEnvironment.Initialise()
            // Route ApplEnv (and everything that derives paths from it: AudibleClient
            // profile config, BookDbContext, BookLibrary image cache, ...) to the
            // GUI-shared "Oahu" data root. Must happen BEFORE any code path touches
            // ApplEnv.LocalApplDirectory; cheap (no I/O) so we always run it.
            try {
                CoreEnvironment.Initialize()
            } catch (ex Exception) {
                // Don't take the whole CLI down if hardware-id selection fails
                // (e.g. exotic platform). Log and continue — auth/library commands
                // will surface a clearer error if they actually try to use Core.
                Console.Error.WriteLine("oahu-cli: warning: ${ex.GetType().Name}: ${ex.Message}")
            }
            let minLevel = ResolveMinLogLevel(args)
            let logBuffer = LogRingBuffer(minimumLevel: minLevel)
            TuiCommand.LogBuffer = logBuffer
            using let loggerFactory = LoggerFactory.Create(
                (builder ILoggingBuilder) -> {
                    builder.SetMinimumLevel(minLevel)
                    builder.AddProvider(RotatingFileLoggerProvider(minLevel))
                    builder.AddProvider(logBuffer)
                }
            )
            let root = RootCommandFactory.Create(() -> loggerFactory)
            try {
                let parseResult = root.Parse(args)
                let rewriteCode = ParseErrorRewriter.RewriteIfNeeded(parseResult, CliEnvironment.Error)
                if rewriteCode is int32 code {
                    return code
                }
                return await parseResult.InvokeAsync().ConfigureAwait(false)
            } catch (OperationCanceledException) {
                // Ctrl+C in command mode (per §10): exit code 130.
                return ExitCodes.Cancelled
            } catch (ex Exception) {
                // Last-resort: never let an exception escape uncaught.
                try {
                    CliEnvironment.Error.WriteLine("oahu-cli: ${ex.GetType().Name}: ${ex.Message}")
                    CliEnvironment.Error.WriteLine(
                        "(Run `oahu-cli doctor` to verify your environment, or check the daily log under the logs directory.)"
                    )
                } catch {
                    // ignore secondary failures

                }
                return ExitCodes.GenericFailure
            } finally {
                CliEnvironment.RunRestore()
            }
        }

        private func ResolveMinLogLevel(args[]string) LogLevel {
            // Quick prescan — final --log-level wins, --verbose adds Debug, otherwise Information.
            var raw string? = nil
            var verbose = false
            for var i = 0;
            i < args.Length;
            i++ {
                if args[i] == "--log-level" && i + 1 < args.Length {
                    raw = args[i + 1]
                } else if args[i].StartsWith("--log-level=", StringComparison.Ordinal) {
                    raw = args[i].Substring("--log-level=".Length)
                } else if args[i] == "--verbose" {
                    verbose = true
                }
            }
            if !string.IsNullOrEmpty(raw) {
                return switch raw.ToLowerInvariant() {
                    case "trace": LogLevel.Trace
                    case "debug": LogLevel.Debug
                    case "information" or "info": LogLevel.Information
                    case "warning" or "warn": LogLevel.Warning
                    case "error": LogLevel.Error
                    case "critical" or "crit": LogLevel.Critical
                    case "none" or "off": LogLevel.None
                    default: LogLevel.Information
                }
            }
            return if verbose {
                LogLevel.Debug
            } else {
                LogLevel.Information
            }
        }
    }
}
