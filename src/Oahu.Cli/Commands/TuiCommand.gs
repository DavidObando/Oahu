package Oahu.Cli.Commands

import System
import System.CommandLine
import System.CommandLine.Parsing
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Models
import Oahu.Cli.Tui
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Logging
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Oahu.Cli
import System.Reflection

/// `oahu-cli tui` — explicit TUI entry. Equivalent to running
/// `oahu-cli` with no arguments.
class TuiCommand {
    shared {
        /// Legacy alias for (cref:ExitCodes.GenericFailure); kept for source compatibility with tests.
        const NotImplementedExitCode int32 = ExitCodes.GenericFailure

        /// Hook for tests / phase 7+ to swap the production launcher with a fake
        /// (e.g. one that captures the (cref:AppShellOptions) instead of
        /// touching the real terminal).
        private var _launcher(AppShellOptions) -> int32 = (opts AppShellOptions) -> TuiHost.Run(
            opts,
            CliEnvironment.RegisterRestore
        )

        prop Launcher(AppShellOptions) -> int32 {
            get {
                return _launcher
            }
            set {
                _launcher = value
            }
        }

        /// In-process accessor to the Logs ring buffer. (cref:Program) sets
        /// this when it builds the LoggerFactory; the TUI launcher reads it so the
        /// L-toggle overlay shows entries.
        prop LogBuffer LogRingBuffer?

        func Create() Command {
            let cmd = Command(
                "tui",
                "Launch the interactive TUI (full-screen). Equivalent to running `oahu-cli` with no arguments."
            )
            cmd.SetAction((_ ParseResult) -> Run())
            return cmd
        }

        /// Overload that lets the subcommand share the root's `--theme` /
        /// `--no-color` resolution.
        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let cmd = Command(
                "tui",
                "Launch the interactive TUI (full-screen). Equivalent to running `oahu-cli` with no arguments."
            )
            cmd.SetAction((parse ParseResult) -> Run(resolveGlobals(parse)))
            return cmd
        }

        func Run() int32 -> Run(GlobalOptions())

        func Run(globals GlobalOptions) int32 {
            if !CliEnvironment.CanEnterTui {
                CliEnvironment.Error.WriteLine("✗ TUI mode requires an interactive terminal.")
                CliEnvironment.Error.WriteLine()
                CliEnvironment.Error.WriteLine("  Run a subcommand instead, e.g.:")
                CliEnvironment.Error.WriteLine("    oahu-cli doctor --json")
                CliEnvironment.Error.WriteLine("  Or run `oahu-cli --help` for the full command set.")
                return TuiHost.NoTtyExitCode
            }
            // Apply the theme BEFORE building any screens so the first frame uses
            // the right palette. Precedence: --theme flag > NO_COLOR/--no-color → Mono
            // > persisted OahuConfig.Theme > Default. Unknown names silently fall
            // back to Default so a stale config can never wedge startup.
            ApplyStartupTheme(globals)
            let state = AppShellState()
            // Populate initial profile from existing sessions.
            try {
                let auth = CliServiceFactory.AuthServiceFactory()
                let session AuthSession? = auth.GetActiveAsync().GetAwaiter().GetResult()
                if session != nil {
                    state.Profile = session.ProfileAlias
                    state.Region = session.Region.ToString().ToLowerInvariant()
                }
            } catch {
                // Swallow — fresh install has no profiles.

            }
            // Refresh the library incrementally from Audible (like the GUI does on
            // startup) so newly purchased books appear immediately. The guard inside
            // EnsureFreshAsync makes this a no-op if any later command already
            // triggered a refresh. Failures are silently ignored.
            try {
                let lib = CliServiceFactory.LibraryServiceFactory()
                lib.EnsureFreshAsync().GetAwaiter().GetResult()
            } catch {
                // Non-fatal — TUI still works with stale cache.

            }
            let tabs = DefaultTabs.CreateReal(
                state,
                CliServiceFactory.AuthServiceFactory,
                CliServiceFactory.LibraryServiceFactory,
                () -> CliServiceFactory.ConfigServiceFactory(),
                CliServiceFactory.QueueServiceFactory,
                CliServiceFactory.JobServiceFactory
            )
            // Sign-in flow is owned by HomeScreen: pressing 's' opens the region
            // picker modal via the navigator, then SignInFlow drives the broker
            // and library sync. No additional wiring needed here.
            let opts = AppShellOptions{
                UseAscii: string.Equals(
                    Environment.GetEnvironmentVariable("OAHU_ASCII_ICONS"),
                    "1",
                    StringComparison.Ordinal
                ),
                LogBuffer: LogBuffer,
                Version: ResolveVersion(),
                Tabs: tabs,
                State: state,
                ConfigServiceFactory: () -> CliServiceFactory.ConfigServiceFactory()
            }
            return Launcher(opts)
        }

        /// Resolve the effective theme name and apply it via (cref:Theme.Use(string)).
        /// Public for testing — callers normally rely on (cref:Run(GlobalOptions)).
        func ResolveStartupThemeName(globals GlobalOptions, configuredTheme string?) string {
            // 1. --theme flag wins.
            if TryMatchTheme(globals.ThemeOverride, out var explicitName) {
                return explicitName
            }
            // 2. Colour-disabled environments → Mono.
            if globals.ForceNoColor || CliEnvironment.NoColorRequested {
                return Themes.Mono.Name
            }
            // 3. Persisted config value (silently ignored if unknown).
            if TryMatchTheme(configuredTheme, out var configured) {
                return configured
            }
            return Themes.Default.Name
        }

        private func TryMatchTheme(candidate string?, out resolved string) bool {
            if !string.IsNullOrEmpty(candidate) {
                for name in Theme.AvailableNames() {
                    if string.Equals(name, candidate, StringComparison.OrdinalIgnoreCase) {
                        resolved = name
                        return true
                    }
                }
            }
            resolved = string.Empty
            return false
        }

        private func ApplyStartupTheme(globals GlobalOptions) {
            var configured string? = nil
            try {
                let cfg = CliServiceFactory.ConfigServiceFactory().LoadAsync().GetAwaiter().GetResult()
                configured = cfg.Theme
            } catch {
                // Fresh installs / unreadable config → fall back to defaults.

            }
            let name = ResolveStartupThemeName(globals, configured)
            try {
                Theme.Use(name)
            } catch {
                Theme.Reset()
            }
        }

        private func ResolveVersion() string {
            try {
                let asm = typeof(TuiCommand).Assembly
                let info = asm.GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute), inherit: false)
                if info.Length > 0 {
                    let v = (cast[AssemblyInformationalVersionAttribute](info[0])).InformationalVersion
                    // Strip "+commit" suffix that GitVersioning appends.
                    let plus = v.IndexOf('+')
                    return if plus >= 0 {
                        v[.. plus]
                    } else {
                        v
                    }
                }
                return asm.GetName().Version?.ToString() ?? string.Empty
            } catch {
                return string.Empty
            }
        }
    }
}
