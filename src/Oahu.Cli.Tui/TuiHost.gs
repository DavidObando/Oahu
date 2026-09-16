package Oahu.Cli.Tui

import Oahu.Cli.App.Errors
import Oahu.Cli.Tui.Shell
import Spectre.Console
import System

/// Public Phase 6 entry point. Owns the alt-screen lifecycle and the
/// (cref:Shell.AppShell) instance. The CLI host calls
/// (cref:Run) from the `oahu-cli` default action and the
/// `oahu-cli tui` subcommand.
class TuiHost {
    shared {
        /// Exit code returned when the host refuses to enter (non-TTY).
        const NoTtyExitCode int32 = ExitCodes.UsageError

        /// Run the AppShell against the real (cref:Console). This switches
        /// the terminal into the alt-screen buffer, sets `TreatControlCAsInput`
        /// so the progressive Ctrl+C state machine sees presses as keys, and
        /// guarantees a terminal restore even on unhandled exceptions.
        /// @param options Shell options. May be null.
        /// @param registerRestore Optional hook to register the alt-screen leave action with an external
        /// exit-trap (the CLI uses `CliEnvironment.RegisterRestore`).
        func Run(options AppShellOptions? = nil, registerRestore((() -> void) -> void)? = nil) int32 {
            let console = AnsiConsole.Console
            let shell = AppShell(console, options)
            var prevTreatCtrlC = false
            var altEntered = false
            var mouseEnabled = false
            let restore() -> void = () -> {
                if mouseEnabled {
                    if OperatingSystem.IsWindows() {
                        WindowsConsoleInput.Restore()
                    } else {
                        AltScreen.DisableMouse()
                    }
                    mouseEnabled = false
                }
                if altEntered {
                    AltScreen.Leave()
                    altEntered = false
                }
                try {
                    Console.TreatControlCAsInput = prevTreatCtrlC
                } catch {
                    // some hosts don't support this setting; ignore.

                }
            }
            registerRestore?(restore)
            try {
                try {
                    prevTreatCtrlC = Console.TreatControlCAsInput
                    Console.TreatControlCAsInput = true
                } catch {
                    // ignore — we'll fall back to the cooperative SIGINT path.

                }
                AltScreen.Enter()
                altEntered = true
                // Mouse reporting (wheel + click). Opt out with OAHU_NO_MOUSE=1.
                if !string.Equals(Environment.GetEnvironmentVariable("OAHU_NO_MOUSE"), "1", StringComparison.Ordinal) {
                    if OperatingSystem.IsWindows() {
                        mouseEnabled = WindowsConsoleInput.TrySetup()
                    } else {
                        AltScreen.EnableMouse()
                        mouseEnabled = true
                    }
                }
                return shell.Run(AppShell.ConsoleKeyReader())
            } finally {
                restore()
            }
        }
    }
}
