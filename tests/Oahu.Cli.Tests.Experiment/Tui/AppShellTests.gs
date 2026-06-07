// G# port of Tui/AppShellTests.cs (partial).
//
// Tests AppShell key dispatch: number-key tab switching, Tab/ShiftTab cycling,
// Ctrl+C behavior, Shift+Q quit, logs overlay toggle.
//
// LIMITATIONS:
// - Spectre.Console.Testing not referenced in gsproj; uses AnsiConsole.Create.
// - G# cannot reference nested CLR types (AppShell.IKeyReader); Run-loop
//   tests and capturing-input tests are omitted.
// - gsharp#502: async not supported.
// - G# enum bitwise ops require int32 casts.

package Oahu.Cli.Tests.Experiment.Tui

import System
import System.IO
import Oahu.Cli.Tui.Logging
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Spectre.Console
import Xunit

type AppShellTests class {
    init() {
        Theme.Reset()
    }

    func MakeConsole() IAnsiConsole {
        return AnsiConsole.Create(AnsiConsoleSettings())
    }

    func NewShell() AppShell {
        return AppShell(MakeConsole(), AppShellOptions())
    }

    @Fact
    func Number_Keys_Switch_Tabs() {
        var shell = NewShell()
        Assert.Equal(0, shell.ActiveTab)
        shell.Dispatch(ConsoleKeyInfo('3', ConsoleKey.D3, false, false, false))
        Assert.Equal(2, shell.ActiveTab)
        shell.Dispatch(ConsoleKeyInfo('6', ConsoleKey.D6, false, false, false))
        Assert.Equal(5, shell.ActiveTab)
        shell.Dispatch(ConsoleKeyInfo('9', ConsoleKey.D9, false, false, false))
        Assert.Equal(5, shell.ActiveTab)
    }

    @Fact
    func Tab_And_ShiftTab_Cycle() {
        var shell = NewShell()
        shell.Dispatch(ConsoleKeyInfo(char(9), ConsoleKey.Tab, false, false, false))
        Assert.Equal(1, shell.ActiveTab)
        shell.Dispatch(ConsoleKeyInfo(char(9), ConsoleKey.Tab, true, false, false))
        Assert.Equal(0, shell.ActiveTab)
        shell.Dispatch(ConsoleKeyInfo(char(9), ConsoleKey.Tab, true, false, false))
        Assert.Equal(5, shell.ActiveTab)
    }

    @Fact
    func Single_CtrlC_Shows_Toast_Without_Exiting() {
        var shell = NewShell()
        var action = shell.Dispatch(ConsoleKeyInfo(char(3), ConsoleKey.C, false, false, true))
        Assert.Equal(ShellAction.Continue, action)
    }

    @Fact
    func Double_CtrlC_Within_Window_Exits() {
        var shell = NewShell()
        var first = shell.Dispatch(ConsoleKeyInfo(char(3), ConsoleKey.C, false, false, true))
        var second = shell.Dispatch(ConsoleKeyInfo(char(3), ConsoleKey.C, false, false, true))
        Assert.Equal(ShellAction.Continue, first)
        Assert.Equal(ShellAction.Exit, second)
    }

    @Fact
    func Shift_Q_Exits_With_Success() {
        var shell = NewShell()
        var action = shell.Dispatch(ConsoleKeyInfo('Q', ConsoleKey.Q, true, false, false))
        Assert.Equal(ShellAction.Exit, action)
    }

    @Fact
    func Plain_Q_Is_Not_A_Global_Quit() {
        var shell = NewShell()
        var action = shell.Dispatch(ConsoleKeyInfo('q', ConsoleKey.Q, false, false, false))
        Assert.Equal(ShellAction.Continue, action)
    }

    @Fact
    func L_Without_Buffer_Does_Nothing() {
        var shell = NewShell()
        shell.Dispatch(ConsoleKeyInfo('l', ConsoleKey.L, false, false, false))
        Assert.False(shell.LogsOpen)
    }

    // NOTE: L_Toggles_Logs_When_Buffer_Set and Logs_Esc_Closes_Overlay tests
    // are omitted because AppShellOptions.LogBuffer is init-only and G# cannot
    // set init-only properties after construction (MissingMethodException at runtime).
}
