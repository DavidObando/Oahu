using System;

namespace Oahu.Cli.Tui.Shell;

public enum MouseEventKind
{
    WheelUp,
    WheelDown,
    Click,
}

public readonly record struct MouseEvent(MouseEventKind Kind, int X, int Y);

public readonly record struct ShellInputEvent
{
    public ConsoleKeyInfo? Key { get; init; }

    public MouseEvent? Mouse { get; init; }

    public static ShellInputEvent FromKey(ConsoleKeyInfo key) => new() { Key = key };

    public static ShellInputEvent FromMouse(MouseEvent mouseEvent) => new() { Mouse = mouseEvent };
}

public static class SgrMouseParser
{
    public static bool TryParse(Func<char?> readNext, out MouseEvent? mouseEvent)
    {
        mouseEvent = null;
        if (!ReadNumber(readNext, out var button, out var firstTerminator) || firstTerminator != ';')
        {
            return false;
        }
        if (!ReadNumber(readNext, out var x, out var secondTerminator) || secondTerminator != ';')
        {
            return false;
        }
        if (!ReadNumber(readNext, out var y, out var final) || (final != 'M' && final != 'm'))
        {
            return false;
        }
        if (final == 'm')
        {
            return true;
        }
        if ((button & 64) != 0)
        {
            var kind = (button & 1) == 0 ? MouseEventKind.WheelUp : MouseEventKind.WheelDown;
            mouseEvent = new MouseEvent(kind, Math.Max(0, x - 1), Math.Max(0, y - 1));
            return true;
        }
        if ((button & 32) != 0)
        {
            return true;
        }
        if ((button & 3) == 0)
        {
            mouseEvent = new MouseEvent(MouseEventKind.Click, Math.Max(0, x - 1), Math.Max(0, y - 1));
        }
        return true;
    }

    private static bool ReadNumber(Func<char?> readNext, out int value, out char terminator)
    {
        value = 0;
        terminator = ' ';
        var digits = 0;
        while (true)
        {
            var character = readNext();
            if (character is null)
            {
                return false;
            }
            if (character >= '0' && character <= '9')
            {
                value = (value * 10) + (character.Value - '0');
                if (++digits > 5)
                {
                    return false;
                }
                continue;
            }
            terminator = character.Value;
            return digits > 0;
        }
    }
}
