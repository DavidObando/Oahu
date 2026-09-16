package Oahu.Cli.Tui.Shell

import System

/// Kind of a decoded terminal mouse event.
enum MouseEventKind {
    WheelUp,
    WheelDown,
    Click
}

/// A decoded terminal mouse event in 0-based cell coordinates.
data struct MouseEvent(Kind MouseEventKind, X int32, Y int32)

/// A single input event handed to the shell: exactly one of (cref:Key) or
/// (cref:Mouse) is set.
data struct ShellInputEvent {
    prop Key ConsoleKeyInfo? {
        get;
        init;
    }

    prop Mouse MouseEvent? {
        get;
        init;
    }

    shared {
        func FromKey(key ConsoleKeyInfo) ShellInputEvent -> ShellInputEvent{Key: key}

        func FromMouse(ev MouseEvent) ShellInputEvent -> ShellInputEvent{Mouse: ev}
    }
}

/// Parser for xterm SGR mouse reports (`ESC [ < b ; x ; y M|m`, DECSET 1006).
/// On Unix, .NET's console driver delivers unrecognized escape sequences one
/// character at a time — an Escape key followed by `[`, `<`, digits, `;`, and
/// a final `M`/`m` — so the reader consumes the tail through this parser after
/// seeing `ESC [ <`.
class SgrMouseParser {
    shared {
        /// Parse the report body after `ESC [ <` has been consumed.
        /// [`readNext`](paramref) returns the next available character, or nil
        /// when the stream dries up mid-sequence. Returns true when a complete
        /// report was consumed; [`ev`](paramref) is nil for reports that parse
        /// but carry no action (releases, drags, non-left buttons).
        func TryParse(readNext() -> char?, out ev MouseEvent?) bool {
            ev = nil
            if !ReadNumber(readNext, out var b, out var term1) || term1 != ';' {
                return false
            }
            if !ReadNumber(readNext, out var x, out var term2) || term2 != ';' {
                return false
            }
            if !ReadNumber(readNext, out var y, out var final) || (final != 'M' && final != 'm') {
                return false
            }
            // Release ('m') carries no action of its own.
            if final == 'm' {
                return true
            }
            // Wheel: bit 6 set; bit 0 distinguishes up (0) from down (1).
            if (b & 64) != 0 {
                let kind = if (b & 1) == 0 {
                    MouseEventKind.WheelUp
                } else {
                    MouseEventKind.WheelDown
                }
                ev = MouseEvent(kind, Math.Max(0, x - 1), Math.Max(0, y - 1))
                return true
            }
            // Drag (bit 5) — consumed, ignored.
            if (b & 32) != 0 {
                return true
            }
            // Button press: only the left button (low bits 00) acts.
            if (b & 3) == 0 {
                ev = MouseEvent(MouseEventKind.Click, Math.Max(0, x - 1), Math.Max(0, y - 1))
            }
            return true
        }

        /// Accumulate decimal digits until a non-digit terminator (returned in
        /// [`terminator`](paramref)). Fails on end-of-stream or an empty number.
        private func ReadNumber(readNext() -> char?, out value int32, out terminator char) bool {
            value = 0
            terminator = ' '
            var digits = 0
            while true {
                let c = readNext()
                if c == nil {
                    return false
                }
                if c >= '0' && c <= '9' {
                    value = (value * 10) + (int32(c!!) - int32('0'))
                    digits++
                    if digits > 5 {
                        return false
                    }
                    continue
                }
                terminator = c!!
                return digits > 0
            }
        }
    }
}
