package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Logging
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Spectre.Console
import Spectre.Console.Rendering
import Spectre.Console.Testing
import System
import System.Collections.Generic
import Xunit

@Collection("EnvVarSerial")
class AppShellTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() -> Theme.Reset()

    @Fact
    func Number_Keys_Switch_Tabs() {
        let shell = NewShell()
        Assert.Equal(0, shell.ActiveTab)
        shell.Dispatch(Key('3', ConsoleKey.D3))
        Assert.Equal(2, shell.ActiveTab)
        shell.Dispatch(Key('6', ConsoleKey.D6))
        Assert.Equal(5, shell.ActiveTab)
        // Out-of-range numbers are ignored.
        shell.Dispatch(Key('9', ConsoleKey.D9))
        Assert.Equal(5, shell.ActiveTab)
    }

    @Fact
    func Tab_And_ShiftTab_Cycle() {
        let shell = NewShell()
        shell.Dispatch(Key('\t', ConsoleKey.Tab))
        Assert.Equal(1, shell.ActiveTab)
        shell.Dispatch(Key('\t', ConsoleKey.Tab, ConsoleModifiers.Shift))
        Assert.Equal(0, shell.ActiveTab)
        // Wrap backward from 0 -> last.
        shell.Dispatch(Key('\t', ConsoleKey.Tab, ConsoleModifiers.Shift))
        Assert.Equal(shell.Tabs.Count - 1, shell.ActiveTab)
    }

    @Fact
    func Single_CtrlC_Shows_Toast_Without_Exiting() {
        let shell = NewShell()
        let action = shell.Dispatch(Key(char(3), ConsoleKey.C, ConsoleModifiers.Control))
        Assert.Equal(ShellAction.Continue, action)
    }

    @Fact
    func Double_CtrlC_Within_Window_Exits() {
        let shell = NewShell()
        let first = shell.Dispatch(Key(char(3), ConsoleKey.C, ConsoleModifiers.Control))
        let second = shell.Dispatch(Key(char(3), ConsoleKey.C, ConsoleModifiers.Control))
        Assert.Equal(ShellAction.Continue, first)
        // Cooperative Ctrl+C-quit from an idle shell is a clean exit (code 0),
        // not SIGINT (130). The 130 path is reserved for the runtime
        // force-exit fallback when the cooperative state machine fails.
        Assert.Equal(ShellAction.Exit, second)
    }

    @Fact
    func Shift_Q_Exits_With_Success() {
        let shell = NewShell()
        let action = shell.Dispatch(Key('Q', ConsoleKey.Q, ConsoleModifiers.Shift))
        Assert.Equal(ShellAction.Exit, action)
    }

    @Fact
    func Mouse_Click_On_Header_Tab_Switches() {
        let shell = NewShell()
        // Tab strip starts at column 9; entry 1 ("2 library") spans strip
        // columns 9..19 → screen columns 18..28.
        shell.DispatchMouse(MouseEvent(MouseEventKind.Click, 20, 0))
        Assert.Equal(1, shell.ActiveTab)
        // Brand pill (columns 1..6) jumps home.
        shell.DispatchMouse(MouseEvent(MouseEventKind.Click, 3, 0))
        Assert.Equal(0, shell.ActiveTab)
    }

    @Fact
    func Mouse_Wheel_Routes_To_Active_Screen() {
        let screen = ScrollRecordingScreen()
        let shell = AppShell(NewConsole(), AppShellOptions{Tabs: []ITabScreen{screen}})
        shell.DispatchMouse(MouseEvent(MouseEventKind.WheelDown, 5, 10))
        Assert.Equal(3, screen.LastScrollDelta)
        shell.DispatchMouse(MouseEvent(MouseEventKind.WheelUp, 5, 10))
        Assert.Equal(-3, screen.LastScrollDelta)
    }

    @Fact
    func Mouse_Is_Inert_While_Modal_Open() {
        let shell = NewShell()
        shell.ShowModal(TestModal())
        shell.DispatchMouse(MouseEvent(MouseEventKind.Click, 20, 0))
        Assert.Equal(0, shell.ActiveTab)
    }

    private class ScrollRecordingScreen : ITabScreen {
        prop LastScrollDelta int32 {
            get;
            private set;
        }

        prop Title string -> "Scrolly"
        prop NumberKey char -> '1'
        prop Hints IEnumerable[KeyValuePair[string, string?]] -> Array.Empty[KeyValuePair[string, string?]]()

        func Render(width int32, height int32) IRenderable -> Markup("scroll test")

        func HandleKey(key ConsoleKeyInfo) bool -> false

        func HandleScroll(delta int32) bool {
            LastScrollDelta = delta
            return true
        }
    }

    private class TestModal : IModal {
        prop IsComplete bool -> false
        prop WasCancelled bool -> false

        func Render(width int32, height int32) IRenderable -> Markup("modal")

        func HandleKey(key ConsoleKeyInfo) bool -> true
    }

    @Fact
    func Plain_Q_Is_A_Global_Quit() {
        // Streamlined keymap: no screen binds `q`, so an unconsumed plain `q`
        // is the clean-quit gesture on every tab.
        let shell = NewShell()
        let action = shell.Dispatch(Key('q', ConsoleKey.Q))
        Assert.Equal(ShellAction.Exit, action)
    }

    @Fact
    func Plain_Q_Reaches_Active_Screen_When_Capturing() {
        let capturingScreen = InputCapturingScreen()
        let shell = AppShell(NewConsole(), AppShellOptions{Tabs: []ITabScreen{capturingScreen}})
        capturingScreen.Capturing = true
        let action = shell.Dispatch(Key('q', ConsoleKey.Q))
        Assert.Equal(ShellAction.Continue, action)
        Assert.True(capturingScreen.ReceivedQ, "Screen did not receive the 'q' key")
    }

    @Fact
    func L_Toggles_Logs_When_Buffer_Set() {
        let buf = LogRingBuffer()
        let shell = NewShell(buf: buf)
        Assert.False(shell.LogsOpen)
        shell.Dispatch(Key('l', ConsoleKey.L))
        Assert.True(shell.LogsOpen)
        // L again (no Ctrl) closes via the overlay's own handler.
        shell.Dispatch(Key('l', ConsoleKey.L))
        Assert.False(shell.LogsOpen)
    }

    @Fact
    func L_Without_Buffer_Does_Nothing() {
        let shell = NewShell(buf: nil)
        shell.Dispatch(Key('l', ConsoleKey.L))
        Assert.False(shell.LogsOpen)
    }

    @Fact
    func Logs_Esc_Closes_Overlay() {
        let buf = LogRingBuffer()
        let shell = NewShell(buf: buf)
        shell.Dispatch(Key('l', ConsoleKey.L))
        Assert.True(shell.LogsOpen)
        shell.Dispatch(Key(char(27), ConsoleKey.Escape))
        Assert.False(shell.LogsOpen)
    }

    @Fact
    func KeyReader_EOF_Returns_Cleanly() {
        let shell = NewShell()
        let reader = AppShellTests.ScriptedReader()
        Assert.Equal(0, shell.Run(reader))
    }

    @Fact
    func Run_Returns_Success_When_Ctrl_C_Exits_Idle_Shell() {
        // Cooperative Ctrl+C-quit from an idle shell is a clean exit (0),
        // not SIGINT (130). 130 is reserved for the runtime force-exit
        // fallback in CliEnvironment.
        let shell = NewShell()
        let reader = AppShellTests.ScriptedReader(
            Key(char(3), ConsoleKey.C, ConsoleModifiers.Control),
            Key(char(3), ConsoleKey.C, ConsoleModifiers.Control)
        )
        Assert.Equal(0, shell.Run(reader))
    }

    @Fact
    func Run_Honours_Shift_Q_As_Clean_Quit() {
        let shell = NewShell()
        let reader = AppShellTests.ScriptedReader(Key('Q', ConsoleKey.Q, ConsoleModifiers.Shift))
        Assert.Equal(0, shell.Run(reader))
    }

    @Fact
    func Screen_Capturing_Input_Suppresses_Global_L() {
        // Regression: typing 'l' in Library search opened the logs overlay
        // instead of being forwarded to the search TextInput.
        let buf = LogRingBuffer()
        let capturingScreen = InputCapturingScreen()
        let shell = AppShell(NewConsole(), AppShellOptions{Tabs: []ITabScreen{capturingScreen}, LogBuffer: buf})
        // Screen is capturing — 'l' should go to screen, not open logs.
        capturingScreen.Capturing = true
        shell.Dispatch(Key('l', ConsoleKey.L))
        Assert.False(shell.LogsOpen, "'l' opened logs even though the screen was capturing input")
        Assert.True(capturingScreen.ReceivedL, "Screen did not receive the 'l' key")
        // Screen is NOT capturing — 'l' should open logs.
        capturingScreen.Capturing = false
        shell.Dispatch(Key('l', ConsoleKey.L))
        Assert.True(shell.LogsOpen, "'l' should open logs when screen is not capturing input")
    }

    @Fact
    func Screen_Capturing_Input_Suppresses_Number_Keys() {
        let capturingScreen = InputCapturingScreen()
        let placeholder = InputCapturingScreen{Title: "Other", NumberKey: '2'}
        let shell = AppShell(NewConsole(), AppShellOptions{Tabs: []ITabScreen{capturingScreen, placeholder}})
        capturingScreen.Capturing = true
        shell.Dispatch(Key('2', ConsoleKey.D2))
        Assert.Equal(0, shell.ActiveTab) // Should NOT switch tabs

    }

    private class InputCapturingScreen : ITabScreen {
        init() {
            Title = "Test"
            NumberKey = '1'
        }

        prop Title string {
            get;
            init;
        }

        prop NumberKey char {
            get;
            init;
        }

        prop Capturing bool

        prop ReceivedL bool {
            get;
            private set;
        }

        prop ReceivedQ bool {
            get;
            private set;
        }

        func Render(width int32, height int32) IRenderable -> Markup(string.Empty)

        func HandleKey(key ConsoleKeyInfo) bool {
            if key.Key == ConsoleKey.L {
                ReceivedL = true
            }
            if key.Key == ConsoleKey.Q {
                ReceivedQ = true
            }
            return Capturing // Consume all keys when capturing

        }

        prop Hints IEnumerable[KeyValuePair[string, string?]] -> Array.Empty[KeyValuePair[string, string?]]()
    }

    private class ScriptedReader : AppShell.IKeyReader {
        private let queue Queue[ConsoleKeyInfo]

        init(keys ...ConsoleKeyInfo) {
            queue = Queue[ConsoleKeyInfo](keys)
        }

        func ReadKey() ConsoleKeyInfo? -> if queue.Count == 0 {
            nil
        } else {
            queue.Dequeue()
        }
    }

    shared {
        private func NewConsole(width int32 = 120) TestConsole {
            let c = TestConsole()
            c.Profile.Width = width
            c.Profile.Height = 30
            c.EmitAnsiSequences = false
            return c
        }

        private func NewShell(tabs IReadOnlyList[ITabScreen]? = nil, buf LogRingBuffer? = nil) AppShell -> AppShell(
            NewConsole(),
            AppShellOptions{Tabs: tabs, LogBuffer: buf, Profile: "alice", Region: "us", Version: "0.1.0"}
        )

        private func Key(
            ch char,
            k ConsoleKey = ConsoleKey.NoName,
            mod ConsoleModifiers = ConsoleModifiers.None
        ) ConsoleKeyInfo -> ConsoleKeyInfo(
            ch,
            k,
            shift: (mod & ConsoleModifiers.Shift) != 0,
            alt: (mod & ConsoleModifiers.Alt) != 0,
            control: (mod & ConsoleModifiers.Control) != 0
        )
    }
}
