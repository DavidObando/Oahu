package Oahu.Cli

import System
import System.IO
import System.Runtime.InteropServices
import System.Text
import System.Threading

/// Process-level setup for the CLI: encoding, color policy, TTY detection,
/// and the exit-trap that restores the terminal on crash / Ctrl+C / process exit.
///
/// Mirrors the design-doc `setupProcess()` contract (§5.1 + Phase 1).
class CliEnvironment {
    shared {
        private var restoreInstalled int32
        private var restoreAction(() -> void)?
        private var sigintCount int32
        private var graceTimer Timer?

        private func ForceExit130() {
            try {
                graceTimer?.Dispose()
            } catch {
                // best-effort

            }
            try {
                RunRestore()
            } catch {
                // best-effort

            }
            Environment.Exit(130)
        }

        /// True when the user explicitly disabled colour via `NO_COLOR`.
        prop NoColorRequested bool {
            get;
            private set;
        }

        /// True when the user explicitly forced colour via `FORCE_COLOR`.
        prop ForceColorRequested bool {
            get;
            private set;
        }

        /// True when stdout is attached to an interactive terminal.
        prop IsStdoutTty bool {
            get;
            private set;
        }

        /// True when stderr is attached to an interactive terminal.
        prop IsStderrTty bool {
            get;
            private set;
        }

        /// True when stdin is attached to an interactive terminal.
        prop IsStdinTty bool {
            get;
            private set;
        }

        /// True when the resolved colour policy is "no colour".
        prop ColorDisabled bool -> NoColorRequested && !ForceColorRequested

        /// True when TUI mode is allowed in this process.
        prop CanEnterTui bool {
            get {
                if !IsStdoutTty || !IsStdinTty {
                    return false
                }
                let term = Environment.GetEnvironmentVariable("TERM")
                if string.Equals(term, "dumb", StringComparison.OrdinalIgnoreCase) {
                    return false
                }
                if string.Equals(Environment.GetEnvironmentVariable("OAHU_NO_TUI"), "1", StringComparison.Ordinal) {
                    return false
                }
                return true
            }
        }

        /// Configure the process. Call once, before any console I/O.
        func Initialise() {
            // 1. Console encoding — UTF-8 in & out so unicode glyphs (status icons, box drawing) render.
            try {
                Console.OutputEncoding = Encoding.UTF8
                Console.InputEncoding = Encoding.UTF8
            } catch {
                // Some hosts (redirected handles, certain CI runners) refuse — that's fine, fall through.

            }
            // 2. Windows VT — enable ANSI escape sequence processing on the stdout/stderr
            //    console handles so raw sequences (alt-screen, cursor movement, SGR colours)
            //    render correctly on conhost and older Windows Terminal builds.
            EnableWindowsVirtualTerminal()
            // 3. Colour policy. NO_COLOR present (any value) wins unless FORCE_COLOR is also set.
            // https://no-color.org/  — "any non-empty value" but in practice presence is enough.
            NoColorRequested = Environment.GetEnvironmentVariable("NO_COLOR") != nil
            ForceColorRequested = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("FORCE_COLOR"))
            // 4. TTY detection — used by output writers to auto-degrade and by the TUI gate.
            IsStdoutTty = !Console.IsOutputRedirected
            IsStderrTty = !Console.IsErrorRedirected
            IsStdinTty = !Console.IsInputRedirected
            // 5. Exit-trap: ensure RestoreOnExit fires for Ctrl+C, ProcessExit, AND unhandled exceptions.
            InstallExitTrap()
        }

        /// Register a callback that *must* run on shutdown to restore the terminal
        /// (alt-screen exit, cursor re-enable, raw-mode reset, etc).
        ///
        /// Idempotent — last writer wins. Phase 1 ships only the framework; Phase 6 fills it in.
        func RegisterRestore(restore() -> void) -> restoreAction = restore

        /// Run the restore callback (if any). Safe to call multiple times.
        func RunRestore() {
            let local = Interlocked.Exchange(&restoreAction, nil)
            try {
                local?()
            } catch {
                // Last-resort handler — never throw out of the exit path.

            }
        }

        private func EnableWindowsVirtualTerminal() {
            let EnableVtForHandle = func (handleId int32, vtFlag uint32) {
                let handle = GetStdHandle(handleId)
                if handle == nint.Zero || handle == nint(-1) {
                    return
                }
                if GetConsoleMode(handle, out var mode) {
                    SetConsoleMode(handle, mode | vtFlag)
                }
            }
            if !RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                return
            }
            try {
                const STD_OUTPUT_HANDLE = -11
                const STD_ERROR_HANDLE = -12
                const ENABLE_PROCESSED_OUTPUT uint32 = uint32(0x0001)
                const ENABLE_VIRTUAL_TERMINAL_PROCESSING uint32 = uint32(0x0004)
                const VT_FLAGS = ENABLE_PROCESSED_OUTPUT | ENABLE_VIRTUAL_TERMINAL_PROCESSING
                EnableVtForHandle(STD_OUTPUT_HANDLE, VT_FLAGS)
                EnableVtForHandle(STD_ERROR_HANDLE, VT_FLAGS)
            } catch {
                // Best effort — very old Windows builds or redirected handles may fail.

            }
        }

        @DllImport("kernel32.dll", SetLastError: true)
        private func GetStdHandle(nStdHandle int32) nint;

        @DllImport("kernel32.dll", SetLastError: true)
        private func GetConsoleMode(hConsoleHandle nint, out lpMode uint32) bool;

        @DllImport("kernel32.dll", SetLastError: true)
        private func SetConsoleMode(hConsoleHandle nint, dwMode uint32) bool;

        private func InstallExitTrap() {
            if Interlocked.CompareExchange(&restoreInstalled, 1, 0) != 0 {
                return
            }
            Console.CancelKeyPress += (_ object?, e ConsoleCancelEventArgs) -> {
                // Progressive Ctrl+C state machine (design §10):
                //   1st press → cooperative cancel + 5s grace timer.
                //   2nd press OR timer expiry → force-exit with code 130.
                // System.CommandLine has already set e.Cancel = true on its own
                // handler before we run, so the runtime won't terminate the
                // process for the first press; we only need to force-exit on the
                // second press / timer.
                let n = Interlocked.Increment(&sigintCount)
                if n == 1 {
                    try {
                        Console.Error.WriteLine("oahu-cli: cancelling… press Ctrl+C again to force-quit (5s grace).")
                    } catch {
                        // stderr might be closed; nothing useful we can do.

                    }
                    graceTimer = Timer(
                        (_ object?) -> ForceExit130(),
                        nil,
                        TimeSpan.FromSeconds(5),
                        Timeout.InfiniteTimeSpan
                    )
                    RunRestore()
                } else {
                    ForceExit130()
                }
            }
            AppDomain.CurrentDomain.ProcessExit += (_ object?, _ EventArgs) -> RunRestore()
            AppDomain.CurrentDomain.UnhandledException += (_ object, e UnhandledExceptionEventArgs) -> {
                RunRestore()
                try {
                    let ex = e.ExceptionObject as Exception
                    Console.Error.WriteLine()
                    Console.Error.WriteLine("oahu-cli: unhandled exception: ${ex?.GetType().FullName}: ${ex?.Message}")
                    Console.Error.WriteLine(
                        "(See `oahu-cli doctor` and the daily log under the logs directory for details.)"
                    )
                } catch {
                    // ignore secondary failures.

                }
            }
        }

        /// Stream pair used by the CLI; tests can swap these to capture output.
        private var _out TextWriter = Console.Out

        prop Out TextWriter {
            get {
                return _out
            }
            set {
                _out = value
            }
        }

        /// Stream pair used by the CLI; tests can swap these to capture output.
        private var _error TextWriter = Console.Error

        prop Error TextWriter {
            get {
                return _error
            }
            set {
                _error = value
            }
        }
    }
}
