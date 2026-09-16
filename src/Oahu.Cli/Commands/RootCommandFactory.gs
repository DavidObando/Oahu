package Oahu.Cli.Commands

import Microsoft.Extensions.Logging
import System
import System.CommandLine
import System.CommandLine.Parsing

/// Builds the System.CommandLine root for `oahu-cli`.
///
/// Phase 1 wires only `--version`, `--help`, `doctor`, and the `tui`
/// placeholder. Later phases append `auth`, `library`, `queue`, etc.
class RootCommandFactory {
    shared {
        /// Hook for tests / Phase 6+: replace this delegate to launch the real TUI shell.
        /// The default implementation calls (cref:TuiCommand.Run(GlobalOptions)).
        private var _tuiEntryPoint(GlobalOptions) -> int32 = TuiCommand.Run

        prop TuiEntryPoint(GlobalOptions) -> int32 {
            get {
                return _tuiEntryPoint
            }
            set {
                _tuiEntryPoint = value
            }
        }

        func Create(loggerFactory() -> ILoggerFactory) RootCommand {
            let quietOpt = Option[bool]("--quiet", "-q"){
                Description = "Suppress non-essential output.",
                Recursive = true
            }
            let verboseOpt = Option[bool]("--verbose"){
                Description = "Enable verbose logging to stderr.",
                Recursive = true
            }
            let forceOpt = Option[bool]("--force", "-f"){
                Description = "Bypass safety prompts on destructive commands (e.g. queue clear, auth logout).",
                Recursive = true
            }
            let dryRunOpt = Option[bool]("--dry-run", "-n"){
                Description = "Print what the command would do, then exit without making changes.",
                Recursive = true
            }
            let noColorOpt = Option[bool]("--no-color"){
                Description = "Disable ANSI colour output (also honours the NO_COLOR env var).",
                Recursive = true
            }
            let asciiOpt = Option[bool]("--ascii"){
                Description = "Use ASCII-only icons / borders for hostile terminals.",
                Recursive = true
            }
            let configDirOpt = Option[string?]("--config-dir"){
                Description = "Override the config directory (defaults to ~/.config/oahu or %APPDATA%\\oahu).",
                Recursive = true
            }
            let logDirOpt = Option[string?]("--log-dir"){Description = "Override the log directory.", Recursive = true}
            let logLevelOpt = Option[string?]("--log-level"){
                Description = "Minimum log level: trace|debug|information|warning|error|critical|none.",
                Recursive = true
            }
            let jsonOpt = Option[bool]("--json"){
                Description = "Emit machine-readable JSON output (auto-implies non-pretty rendering).",
                Recursive = true
            }
            let plainOpt = Option[bool]("--plain"){
                Description = "Emit plain text output (tab-separated, no colour). Auto-applied on non-TTY stdout.",
                Recursive = true
            }
            let themeOpt = Option[string?]("--theme"){
                Description = "Override the TUI theme for this invocation (Default | Sunset | Sand | Mono | HighContrast | Colorblind).",
                Recursive = true
            }
            // --json and --plain are mutually exclusive renderers.
            jsonOpt.Validators.Add(
                (result OptionResult) -> {
                    if result.GetValue(jsonOpt) && result.GetValue(plainOpt) {
                        result.AddError("--json and --plain are mutually exclusive; choose one.")
                    }
                }
            )
            let root = RootCommand("Oahu CLI — command-mode + TUI front end for the Oahu Audible toolkit.")
            root.Options.Add(quietOpt)
            root.Options.Add(verboseOpt)
            root.Options.Add(forceOpt)
            root.Options.Add(dryRunOpt)
            root.Options.Add(noColorOpt)
            root.Options.Add(asciiOpt)
            root.Options.Add(configDirOpt)
            root.Options.Add(logDirOpt)
            root.Options.Add(logLevelOpt)
            root.Options.Add(jsonOpt)
            root.Options.Add(plainOpt)
            root.Options.Add(themeOpt)
            let ResolveGlobals = func (pr ParseResult) GlobalOptions {
                return GlobalOptions{
                    Quiet: pr.GetValue(quietOpt),
                    Verbose: pr.GetValue(verboseOpt),
                    Force: pr.GetValue(forceOpt),
                    DryRun: pr.GetValue(dryRunOpt),
                    ForceNoColor: pr.GetValue(noColorOpt),
                    UseAscii: pr.GetValue(asciiOpt) || string.Equals(
                        Environment.GetEnvironmentVariable("OAHU_ASCII_ICONS"),
                        "1",
                        StringComparison.Ordinal
                    ),
                    ConfigDirOverride: pr.GetValue(configDirOpt),
                    LogDirOverride: pr.GetValue(logDirOpt),
                    LogLevelOverride: pr.GetValue(logLevelOpt),
                    Json: pr.GetValue(jsonOpt),
                    Plain: pr.GetValue(plainOpt),
                    ThemeOverride: pr.GetValue(themeOpt)
                }
            }
            // Default action — invoked when the user types `oahu-cli` with no subcommand.
            // Per design §3.1, that means: enter TUI mode (or show a clear error if not a TTY).
            root.SetAction((parse ParseResult) -> TuiEntryPoint(ResolveGlobals(parse)))
            // Subcommands.
            root.Subcommands.Add(TuiCommand.Create(ResolveGlobals))
            root.Subcommands.Add(DoctorCommand.Create(ResolveGlobals, loggerFactory))
            root.Subcommands.Add(UiPreviewCommand.Create(ResolveGlobals))
            root.Subcommands.Add(ConfigCommand.Create(ResolveGlobals))
            root.Subcommands.Add(AuthCommand.Create(ResolveGlobals))
            root.Subcommands.Add(LibraryCommand.Create(ResolveGlobals))
            root.Subcommands.Add(QueueCommand.Create(ResolveGlobals))
            root.Subcommands.Add(DownloadCommand.Create(ResolveGlobals))
            root.Subcommands.Add(ConvertCommand.Create(ResolveGlobals))
            root.Subcommands.Add(HistoryCommand.Create(ResolveGlobals))
            root.Subcommands.Add(ServeCommand.Create(ResolveGlobals))
            root.Subcommands.Add(CompletionCommand.Create())
            return root
        }
    }
}
