package Oahu.Cli.Tui.Shell

import System
import System.Runtime.InteropServices

/// Windows-only input path that surfaces mouse events (wheel + clicks)
/// alongside keys via the native `ReadConsoleInput` API — the classic conhost
/// route; Windows Terminal's ConPTY translates VT mouse into the same records.
///
/// (cref:TrySetup) flips the console input mode (mouse on, QuickEdit off) and
/// must be paired with (cref:Restore) on exit. When setup fails (or off
/// Windows) the reader in (cref:AppShell.ConsoleKeyReader) falls back to the
/// portable `Console.ReadKey` path.
internal class WindowsConsoleInput {
    @StructLayout(LayoutKind.Sequential)
    internal struct KeyEventRecord {
        var KeyDown int32
        var RepeatCount uint16
        var VirtualKeyCode uint16
        var VirtualScanCode uint16
        var UnicodeChar uint16
        var ControlKeyState uint32
    }

    @StructLayout(LayoutKind.Sequential)
    internal struct MouseEventRecord {
        var MousePositionX int16
        var MousePositionY int16
        var ButtonState uint32
        var ControlKeyState uint32
        var EventFlags uint32
    }

    @StructLayout(LayoutKind.Explicit)
    internal struct InputRecord {
        @FieldOffset(0)
        var EventType uint16
        @FieldOffset(4)
        var Key KeyEventRecord
        @FieldOffset(4)
        var Mouse MouseEventRecord
    }

    shared {
        private var stdInHandle nint
        private var originalMode uint32
        private var active bool

        /// True when the native input path is live.
        prop IsActive bool -> active

        func TrySetup() bool {
            if active {
                return true
            }
            if !OperatingSystem.IsWindows() {
                return false
            }
            try {
                stdInHandle = GetStdHandle(StdInputHandle)
                if stdInHandle == nint(0) || stdInHandle == InvalidHandleValue {
                    return false
                }
                if !GetConsoleMode(stdInHandle, out originalMode) {
                    return false
                }
                var mode = originalMode
                mode |= EnableExtendedFlags
                mode |= EnableMouseInput
                // QuickEdit swallows mouse events for its select-to-copy
                // gesture; VT input would re-encode them as escape sequences.
                // (G# has no unary bitwise NOT, so clear via XOR with all-ones.)
                mode &= uint32.MaxValue ^ (EnableQuickEditMode | EnableVirtualTerminalInput)
                if !SetConsoleMode(stdInHandle, mode) {
                    return false
                }
                active = true
                return true
            } catch {
                return false
            }
        }

        func Restore() {
            if !active {
                return
            }
            active = false
            try {
                SetConsoleMode(stdInHandle, originalMode)
            } catch {
                // Best effort.

            }
        }

        /// Blocking read of the next key or mouse event. Returns nil with
        /// [`timedOut`](paramref) set when the wait elapsed; nil without it on
        /// a hard failure (caller falls back to `Console.ReadKey`).
        func ReadEvent(timeoutMs int32, out timedOut bool) ShellInputEvent? {
            timedOut = false
            let deadline = Environment.TickCount64 + int64(Math.Max(0, timeoutMs))
            while true {
                let remaining = if timeoutMs < 0 {
                    Infinite
                } else {
                    uint32(Math.Max(int64(0), deadline - Environment.TickCount64))
                }
                let wait = WaitForSingleObject(stdInHandle, remaining)
                if wait != WaitObject0 {
                    timedOut = true
                    return nil
                }
                if !ReadConsoleInput(stdInHandle, out var rec, 1, out var read) || read == 0 {
                    return nil
                }
                if rec.EventType == KeyEventType {
                    let ke = rec.Key
                    if ke.KeyDown == 0 || IsModifierKey(ke.VirtualKeyCode) {
                        continue
                    }
                    let state = ke.ControlKeyState
                    let shift = (state & ShiftPressed) != 0
                    let alt = (state & (LeftAltPressed | RightAltPressed)) != 0
                    let control = (state & (LeftCtrlPressed | RightCtrlPressed)) != 0
                    return ShellInputEvent.FromKey(
                        ConsoleKeyInfo(char(ke.UnicodeChar), cast[ConsoleKey](int32(ke.VirtualKeyCode)), shift, alt, control)
                    )
                }
                if rec.EventType == MouseEventType {
                    let me = rec.Mouse
                    if (me.EventFlags & MouseWheeled) != 0 {
                        // Wheel delta lives in the high word of ButtonState (signed).
                        let delta = int16(uint16(me.ButtonState >> 16))
                        let kind = if delta > 0 {
                            MouseEventKind.WheelUp
                        } else {
                            MouseEventKind.WheelDown
                        }
                        return ShellInputEvent.FromMouse(
                            MouseEvent(kind, int32(me.MousePositionX), int32(me.MousePositionY))
                        )
                    }
                    // Plain left-button press (EventFlags 0 = press/release,
                    // DoubleClick also acts as a click).
                    if (me.EventFlags == 0 || (me.EventFlags & DoubleClick) != 0) &&
                        (me.ButtonState & FromLeft1stButtonPressed) != 0 {
                        return ShellInputEvent.FromMouse(
                            MouseEvent(MouseEventKind.Click, int32(me.MousePositionX), int32(me.MousePositionY))
                        )
                    }
                    continue
                }
                // Focus/menu/size events — irrelevant here.
                continue
            }
        }

        private func IsModifierKey(vk uint16) bool {
            let v = int32(vk)
            // Shift/Control/Alt, CapsLock, Num/ScrollLock, Left/Right Win.
            return v == 0x10 || v == 0x11 || v == 0x12 || v == 0x14 || v == 0x90 || v == 0x91 || v == 0x5b || v == 0x5c
        }

        private const StdInputHandle int32 = -10
        private let InvalidHandleValue nint = nint(-1)
        private const EnableQuickEditMode uint32 = uint32(0x0040)
        private const EnableExtendedFlags uint32 = uint32(0x0080)
        private const EnableMouseInput uint32 = uint32(0x0010)
        private const EnableVirtualTerminalInput uint32 = uint32(0x0200)
        private const KeyEventType uint16 = uint16(0x0001)
        private const MouseEventType uint16 = uint16(0x0002)
        private const MouseWheeled uint32 = uint32(0x0004)
        private const DoubleClick uint32 = uint32(0x0002)
        private const FromLeft1stButtonPressed uint32 = uint32(0x0001)
        private const ShiftPressed uint32 = uint32(0x0010)
        private const LeftAltPressed uint32 = uint32(0x0002)
        private const RightAltPressed uint32 = uint32(0x0001)
        private const LeftCtrlPressed uint32 = uint32(0x0008)
        private const RightCtrlPressed uint32 = uint32(0x0004)
        private const WaitObject0 uint32 = uint32(0)
        private const Infinite uint32 = uint32(0xFFFFFFFF)


        @DllImport("kernel32.dll", SetLastError: true)
        private func GetStdHandle(nStdHandle int32) nint;

        @DllImport("kernel32.dll", SetLastError: true)
        private func GetConsoleMode(hConsoleHandle nint, out lpMode uint32) bool;

        @DllImport("kernel32.dll", SetLastError: true)
        private func SetConsoleMode(hConsoleHandle nint, dwMode uint32) bool;

        @DllImport("kernel32.dll", SetLastError: true)
        private func WaitForSingleObject(hHandle nint, dwMilliseconds uint32) uint32;

        @DllImport("kernel32.dll", SetLastError: true, CharSet: CharSet.Unicode, EntryPoint: "ReadConsoleInputW")
        private func ReadConsoleInput(
            hConsoleInput nint,
            out lpBuffer InputRecord,
            nLength uint32,
            out lpNumberOfEventsRead uint32
        ) bool;
    }
}
