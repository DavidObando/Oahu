// G# port of Tui/AppShellTests.cs — IMPROVED for 0.1.509.
//
// Added: enum == comparison (no more int32 cast workaround).
//
// DROPPED (still blocked):
// - KeyReader_EOF/Run tests: AppShell.IKeyReader has nullable struct return (ConsoleKeyInfo?)
//   + out param in TryReadKey. G# can't implement interface with these signatures (GS0187).
//   IKeyReader is a nested interface in AppShell → #569 fixed construction but not
//   nullable-value-type return impl.
//
// WORKAROUNDS:
// - AppShellOptions init-only → object initializer.
// - ITabScreen impl with IRenderable Render → Markup("").
// - gsharp#570: IEnumerable<KVP> → List[T].
// - enum ==: NOW WORKS directly (gsharp#574 fixed).

package Oahu.Cli.Tests.Experiment.Tui

import System
import System.Collections.Generic
import Oahu.Cli.Tui.Logging
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Spectre.Console
import Spectre.Console.Rendering
import Xunit

type AppShellTests class : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() {
        Theme.Reset()
    }

    func MakeConsole() IAnsiConsole {
        return AnsiConsole.Create(AnsiConsoleSettings())
    }

    func NewShell() AppShell {
        return AppShell(MakeConsole(), AppShellOptions())
    }

    func NewShellWithBuffer(buf LogRingBuffer) AppShell {
        return AppShell(MakeConsole(), AppShellOptions() { LogBuffer = buf })
    }

    func NewShellWithTabs(tabs List[ITabScreen]) AppShell {
        let roTabs IReadOnlyList[ITabScreen] = tabs
        return AppShell(MakeConsole(), AppShellOptions() { Tabs = roTabs })
    }

    func NewShellWithTabsAndBuffer(tabs List[ITabScreen], buf LogRingBuffer) AppShell {
        let roTabs IReadOnlyList[ITabScreen] = tabs
        return AppShell(MakeConsole(), AppShellOptions() { Tabs = roTabs, LogBuffer = buf })
    }

    func K(ch char, key ConsoleKey, shift bool, alt bool, ctrl bool) ConsoleKeyInfo {
        return ConsoleKeyInfo(ch, key, shift, alt, ctrl)
    }

    @Fact
    func Number_Keys_Switch_Tabs() {
        var shell = NewShell()
        Assert.Equal(0, shell.ActiveTab)
        shell.Dispatch(K('3', ConsoleKey.D3, false, false, false))
        Assert.Equal(2, shell.ActiveTab)
        shell.Dispatch(K('6', ConsoleKey.D6, false, false, false))
        Assert.Equal(5, shell.ActiveTab)
        shell.Dispatch(K('9', ConsoleKey.D9, false, false, false))
        Assert.Equal(5, shell.ActiveTab)
    }

    @Fact
    func Tab_And_ShiftTab_Cycle() {
        var shell = NewShell()
        shell.Dispatch(K(char(9), ConsoleKey.Tab, false, false, false))
        Assert.Equal(1, shell.ActiveTab)
        shell.Dispatch(K(char(9), ConsoleKey.Tab, true, false, false))
        Assert.Equal(0, shell.ActiveTab)
        shell.Dispatch(K(char(9), ConsoleKey.Tab, true, false, false))
        Assert.Equal(shell.Tabs.Count - 1, shell.ActiveTab)
    }

    @Fact
    func Single_CtrlC_Shows_Toast_Without_Exiting() {
        var shell = NewShell()
        var action = shell.Dispatch(K(char(3), ConsoleKey.C, false, false, true))
        Assert.Equal(ShellAction.Continue, action)
    }

    @Fact
    func Double_CtrlC_Within_Window_Exits() {
        var shell = NewShell()
        var first = shell.Dispatch(K(char(3), ConsoleKey.C, false, false, true))
        var second = shell.Dispatch(K(char(3), ConsoleKey.C, false, false, true))
        Assert.Equal(ShellAction.Continue, first)
        Assert.Equal(ShellAction.Exit, second)
    }

    @Fact
    func Shift_Q_Exits_With_Success() {
        var shell = NewShell()
        var action = shell.Dispatch(K('Q', ConsoleKey.Q, true, false, false))
        Assert.Equal(ShellAction.Exit, action)
    }

    @Fact
    func Plain_Q_Is_Not_A_Global_Quit() {
        var shell = NewShell()
        var action = shell.Dispatch(K('q', ConsoleKey.Q, false, false, false))
        Assert.Equal(ShellAction.Continue, action)
    }

    @Fact
    func L_Toggles_Logs_When_Buffer_Set() {
        var buf = LogRingBuffer()
        var shell = NewShellWithBuffer(buf)
        Assert.False(shell.LogsOpen)
        shell.Dispatch(K('l', ConsoleKey.L, false, false, false))
        Assert.True(shell.LogsOpen)
        shell.Dispatch(K('l', ConsoleKey.L, false, false, false))
        Assert.False(shell.LogsOpen)
    }

    @Fact
    func L_Without_Buffer_Does_Nothing() {
        var shell = NewShell()
        shell.Dispatch(K('l', ConsoleKey.L, false, false, false))
        Assert.False(shell.LogsOpen)
    }

    @Fact
    func Logs_Esc_Closes_Overlay() {
        var buf = LogRingBuffer()
        var shell = NewShellWithBuffer(buf)
        shell.Dispatch(K('l', ConsoleKey.L, false, false, false))
        Assert.True(shell.LogsOpen)
        shell.Dispatch(K(char(27), ConsoleKey.Escape, false, false, false))
        Assert.False(shell.LogsOpen)
    }

    @Fact
    func Plain_Q_Reaches_Active_Screen_When_Capturing() {
        var capScreen = ASCapturingScreen()
        capScreen.Capturing = true
        var tabs = List[ITabScreen]()
        let iface ITabScreen = capScreen
        tabs.Add(iface)
        var shell = NewShellWithTabs(tabs)
        var action = shell.Dispatch(K('q', ConsoleKey.Q, false, false, false))
        Assert.Equal(ShellAction.Continue, action)
        Assert.True(capScreen.ReceivedQ)
    }

    @Fact
    func Screen_Capturing_Input_Suppresses_Global_L() {
        var buf = LogRingBuffer()
        var capScreen = ASCapturingScreen()
        capScreen.Capturing = true
        var tabs = List[ITabScreen]()
        let iface ITabScreen = capScreen
        tabs.Add(iface)
        var shell = NewShellWithTabsAndBuffer(tabs, buf)
        shell.Dispatch(K('l', ConsoleKey.L, false, false, false))
        Assert.False(shell.LogsOpen)
        Assert.True(capScreen.ReceivedL)

        capScreen.Capturing = false
        shell.Dispatch(K('l', ConsoleKey.L, false, false, false))
        Assert.True(shell.LogsOpen)
    }

    @Fact
    func Screen_Capturing_Input_Suppresses_Number_Keys() {
        var capScreen = ASCapturingScreen()
        capScreen.Capturing = true
        var placeholder = ASCapturingScreen()
        placeholder.TabTitle = "Other"
        placeholder.TabNumberKey = '2'
        var tabs = List[ITabScreen]()
        let iface1 ITabScreen = capScreen
        let iface2 ITabScreen = placeholder
        tabs.Add(iface1)
        tabs.Add(iface2)
        var shell = NewShellWithTabs(tabs)
        shell.Dispatch(K('2', ConsoleKey.D2, false, false, false))
        Assert.Equal(0, shell.ActiveTab)
    }
}

type ASCapturingScreen class : ITabScreen {
    TabTitle string = "Test"
    TabNumberKey char = '1'
    Capturing bool = false
    ReceivedL bool = false
    ReceivedQ bool = false

    prop Title string { get { return TabTitle } }
    prop NumberKey char { get { return TabNumberKey } }
    prop NeedsTimedRefresh bool { get { return false } }
    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get {
            var list = List[KeyValuePair[string, string?]]()
            return list
        }
    }

    func Render(width int32, height int32) IRenderable {
        return Markup("")
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        if key.Key == ConsoleKey.L {
            ReceivedL = true
        }
        if key.Key == ConsoleKey.Q {
            ReceivedQ = true
        }
        return Capturing
    }

    func OnActivated(navigator IAppShellNavigator) {
    }

    func OnActivatedAsync(navigator IAppShellNavigator) Task? {
        return nil
    }

    func OnDeactivated() {
    }

    func OnShutdown() {
    }
}
