using System;
using System.Runtime.InteropServices;

namespace Oahu.Cli.Tui.Shell;

internal static class WindowsConsoleInput
{
    [StructLayout(LayoutKind.Sequential)]
    internal struct KeyEventRecord
    {
        public int KeyDown;
        public ushort RepeatCount;
        public ushort VirtualKeyCode;
        public ushort VirtualScanCode;
        public ushort UnicodeChar;
        public uint ControlKeyState;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct MouseEventRecord
    {
        public short MousePositionX;
        public short MousePositionY;
        public uint ButtonState;
        public uint ControlKeyState;
        public uint EventFlags;
    }

    [StructLayout(LayoutKind.Explicit)]
    internal struct InputRecord
    {
        [FieldOffset(0)]
        public ushort EventType;

        [FieldOffset(4)]
        public KeyEventRecord Key;

        [FieldOffset(4)]
        public MouseEventRecord Mouse;
    }

    private static nint _stdInHandle;
    private static uint _originalMode;
    private static bool _active;

    public static bool IsActive => _active;

    public static bool TrySetup()
    {
        if (_active)
        {
            return true;
        }
        if (!OperatingSystem.IsWindows())
        {
            return false;
        }
        try
        {
            _stdInHandle = GetStdHandle(StdInputHandle);
            if (_stdInHandle == 0 || _stdInHandle == InvalidHandleValue)
            {
                return false;
            }
            if (!GetConsoleMode(_stdInHandle, out _originalMode))
            {
                return false;
            }
            var mode = _originalMode;
            mode |= EnableExtendedFlags;
            mode |= EnableMouseInput;
            mode &= ~(EnableQuickEditMode | EnableVirtualTerminalInput);
            if (!SetConsoleMode(_stdInHandle, mode))
            {
                return false;
            }
            _active = true;
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static void Restore()
    {
        if (!_active)
        {
            return;
        }
        _active = false;
        try
        {
            SetConsoleMode(_stdInHandle, _originalMode);
        }
        catch
        {
            // Best effort.
        }
    }

    public static ShellInputEvent? ReadEvent(int timeoutMs, out bool timedOut)
    {
        timedOut = false;
        var deadline = Environment.TickCount64 + Math.Max(0, timeoutMs);
        while (true)
        {
            var remaining = timeoutMs < 0
                ? Infinite
                : (uint)Math.Max(0L, deadline - Environment.TickCount64);
            var wait = WaitForSingleObject(_stdInHandle, remaining);
            if (wait != WaitObject0)
            {
                timedOut = true;
                return null;
            }
            if (!ReadConsoleInput(_stdInHandle, out var record, 1, out var read) || read == 0)
            {
                return null;
            }
            if (record.EventType == KeyEventType)
            {
                var key = record.Key;
                if (key.KeyDown == 0 || IsModifierKey(key.VirtualKeyCode))
                {
                    continue;
                }
                var state = key.ControlKeyState;
                var shift = (state & ShiftPressed) != 0;
                var alt = (state & (LeftAltPressed | RightAltPressed)) != 0;
                var control = (state & (LeftCtrlPressed | RightCtrlPressed)) != 0;
                return ShellInputEvent.FromKey(new ConsoleKeyInfo(
                    (char)key.UnicodeChar,
                    (ConsoleKey)key.VirtualKeyCode,
                    shift,
                    alt,
                    control));
            }
            if (record.EventType == MouseEventType)
            {
                var mouse = record.Mouse;
                if ((mouse.EventFlags & MouseWheeled) != 0)
                {
                    var delta = (short)(ushort)(mouse.ButtonState >> 16);
                    var kind = delta > 0 ? MouseEventKind.WheelUp : MouseEventKind.WheelDown;
                    return ShellInputEvent.FromMouse(
                        new MouseEvent(kind, mouse.MousePositionX, mouse.MousePositionY));
                }
                if ((mouse.EventFlags == 0 || (mouse.EventFlags & DoubleClick) != 0) &&
                    (mouse.ButtonState & FromLeft1stButtonPressed) != 0)
                {
                    return ShellInputEvent.FromMouse(
                        new MouseEvent(MouseEventKind.Click, mouse.MousePositionX, mouse.MousePositionY));
                }
            }
        }
    }

    private static bool IsModifierKey(ushort virtualKey)
    {
        var value = (int)virtualKey;
        return value is 0x10 or 0x11 or 0x12 or 0x14 or 0x90 or 0x91 or 0x5b or 0x5c;
    }

    private const int StdInputHandle = -10;
    private static readonly nint InvalidHandleValue = -1;
    private const uint EnableQuickEditMode = 0x0040;
    private const uint EnableExtendedFlags = 0x0080;
    private const uint EnableMouseInput = 0x0010;
    private const uint EnableVirtualTerminalInput = 0x0200;
    private const ushort KeyEventType = 0x0001;
    private const ushort MouseEventType = 0x0002;
    private const uint MouseWheeled = 0x0004;
    private const uint DoubleClick = 0x0002;
    private const uint FromLeft1stButtonPressed = 0x0001;
    private const uint ShiftPressed = 0x0010;
    private const uint LeftAltPressed = 0x0002;
    private const uint RightAltPressed = 0x0001;
    private const uint LeftCtrlPressed = 0x0008;
    private const uint RightCtrlPressed = 0x0004;
    private const uint WaitObject0 = 0;
    private const uint Infinite = 0xffffffff;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern nint GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetConsoleMode(nint hConsoleHandle, out uint lpMode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetConsoleMode(nint hConsoleHandle, uint dwMode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(nint hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "ReadConsoleInputW")]
    private static extern bool ReadConsoleInput(
        nint hConsoleInput,
        out InputRecord lpBuffer,
        uint nLength,
        out uint lpNumberOfEventsRead);
}
