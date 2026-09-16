package Oahu.Cli.Tui.Shell

import System
import System.IO

/// Tiny ANSI helper that toggles the alt-screen buffer and cursor visibility.
///
/// We intentionally bypass Spectre here: (cref:Enter) / (cref:Leave)
/// must work even when the AppShell crashes mid-render and the only thing left
/// running is the exit-trap installed by `CliEnvironment`.
class AltScreen {
    shared {
        /// DECSET 1049 — switch to alt-screen, save cursor.
        const EnterSequence string = "\u001B[?1049h\u001B[?25l"

        /// DECRST 1049 — restore primary buffer, restore cursor.
        const LeaveSequence string = "\u001B[?25h\u001B[?1049l"

        /// Move cursor to (1,1) and clear screen — used when redrawing without leaving alt-screen.
        const ClearSequence string = "\u001B[H\u001B[2J"

        /// Move cursor to (1,1) without clearing — for flicker-free repaints.
        const HomeSequence string = "\u001B[H"

        /// Erase from cursor to end of screen — cleans up leftover lines after a shorter frame.
        const EraseToEndSequence string = "\u001B[J"

        /// DEC private mode 2026: begin synchronized update — terminal buffers output until
        /// (cref:SyncEndSequence).
        const SyncStartSequence string = "\u001B[?2026h"

        /// DEC private mode 2026: end synchronized update — terminal renders the buffered frame atomically.
        const SyncEndSequence string = "\u001B[?2026l"

        /// DECSET 1000 (press/release tracking) + 1006 (SGR encoding) —
        /// enables mouse reporting on Unix terminals.
        const MouseEnableSequence string = "\u001B[?1000;1006h"

        /// DECRST for the mouse modes enabled by (cref:MouseEnableSequence).
        const MouseDisableSequence string = "\u001B[?1006;1000l"

        /// Enable terminal mouse reporting (kept separate from (cref:Enter)
        /// so the exit-trap can restore each concern independently).
        func EnableMouse(writer TextWriter? = nil) {
            let w = writer ?? Console.Out
            try {
                w.Write(MouseEnableSequence)
                w.Flush()
            } catch {
                // Best effort.

            }
        }

        /// Disable terminal mouse reporting.
        func DisableMouse(writer TextWriter? = nil) {
            let w = writer ?? Console.Out
            try {
                w.Write(MouseDisableSequence)
                w.Flush()
            } catch {
                // ignore

            }
        }

        /// Normalize newlines and inject `\e[K` (erase-to-end-of-line) before each `\n`
        /// so each rendered line clears any residual characters from a longer previous frame.
        ///
        /// CRLF must be normalized to LF first: on Windows a naive `Replace("\n", "\e[K\n")`
        /// over `\r\n` input produces `\r\e[K\n`, which moves the cursor to column 1
        /// before erasing — wiping every line's content. Lone `\r` is also stripped
        /// defensively (Spectre.Console's Rule/TabStrip/Markup do not emit bare CRs).
        func InjectEraseBeforeNewlines(raw string) string {
            if string.IsNullOrEmpty(raw) {
                return raw ?? string.Empty
            }
            return raw.Replace("\r\n", "\n").Replace("\r", string.Empty).Replace("\n", "\u001B[K\n")
        }

        func Enter(writer TextWriter? = nil) {
            let w = writer ?? Console.Out
            try {
                w.Write(EnterSequence)
                w.Flush()
            } catch {
                // Best effort: a TTY that can't accept ANSI shouldn't have got here.

            }
        }

        func Leave(writer TextWriter? = nil) {
            let w = writer ?? Console.Out
            try {
                w.Write(LeaveSequence)
                w.Flush()
            } catch {
                // ignore

            }
        }

        func Clear(writer TextWriter? = nil) {
            let w = writer ?? Console.Out
            try {
                w.Write(ClearSequence)
                w.Flush()
            } catch {
                // ignore

            }
        }

        /// Move cursor to (1,1) without clearing for flicker-free redraw.
        func Home(writer TextWriter? = nil) {
            let w = writer ?? Console.Out
            try {
                w.Write(HomeSequence)
                w.Flush()
            } catch {
                // ignore

            }
        }

        /// Erase from cursor to end of screen — call after rendering to clean leftover lines.
        func EraseToEnd(writer TextWriter? = nil) {
            let w = writer ?? Console.Out
            try {
                w.Write(EraseToEndSequence)
                w.Flush()
            } catch {
                // ignore

            }
        }
    }
}
