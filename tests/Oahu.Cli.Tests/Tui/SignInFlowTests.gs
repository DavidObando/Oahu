package Oahu.Cli.Tests.Tui

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Xunit
import Oahu.Cli.Tui.Widgets
import Spectre.Console.Testing

@Collection("EnvVarSerial")
class SignInFlowTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() -> Theme.Reset()

    @Fact
    func RegionPicker_Returns_Selected_Region() {
        let modal = RegionPickerModal()
        Assert.False(modal.IsComplete)
        // Move down to UK
        modal.HandleKey(MakeKey(ConsoleKey.DownArrow))
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.False(modal.WasCancelled)
        Assert.Equal("uk", modal.Result)
    }

    @Fact
    func RegionPicker_Escape_Cancels() {
        let modal = RegionPickerModal()
        modal.HandleKey(MakeKey(ConsoleKey.Escape))
        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
    }

    @Fact
    func RegionPicker_First_Item_Is_US() {
        let modal = RegionPickerModal()
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.Equal("us", modal.Result)
    }

    @Fact
    func ExternalLogin_Accepts_Valid_Url() {
        let modal = ExternalLoginModal(Uri("https://audible.com/login?code=abc"))
        Assert.False(modal.IsComplete)
        // Type a redirect URL
        for c in "https://localhost/callback?code=x" {
            modal.HandleKey(ConsoleKeyInfo(c, ConsoleKey.NoName, false, false, false))
        }
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.False(modal.WasCancelled)
        Assert.Equal("https://localhost/callback?code=x", modal.Result?.ToString())
    }

    @Fact
    func ExternalLogin_Rejects_Invalid_Url() {
        let modal = ExternalLoginModal(Uri("https://audible.com/login"))
        for c in "not-a-url" {
            modal.HandleKey(ConsoleKeyInfo(c, ConsoleKey.NoName, false, false, false))
        }
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.False(modal.IsComplete) // Stays open on invalid input

    }

    @Fact
    func ExternalLogin_Escape_Cancels() {
        let modal = ExternalLoginModal(Uri("https://audible.com/login"))
        modal.HandleKey(MakeKey(ConsoleKey.Escape))
        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
    }

    @Fact
    func ChallengeModal_Accepts_Text() {
        let modal = ChallengeModal{Title: "MFA", Instructions: "Enter code:"}
        for c in "123456" {
            modal.HandleKey(ConsoleKeyInfo(c, ConsoleKey.NoName, false, false, false))
        }
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.Equal("123456", modal.Result)
    }

    @Fact
    func ChallengeModal_Approval_Requires_Only_Enter() {
        let modal = ChallengeModal{Title: "Approval", Instructions: "Approve on device.", ApprovalOnly: true}
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.Equal(string.Empty, modal.Result)
    }

    @Fact
    func CredentialsModal_Submits_Username_And_Password() {
        let modal = CredentialsModal("us")
        for c in "alice@example.com" {
            modal.HandleKey(ConsoleKeyInfo(c, ConsoleKey.NoName, false, false, false))
        }
        modal.HandleKey(MakeKey(ConsoleKey.Tab))
        for c in "hunter2" {
            modal.HandleKey(ConsoleKeyInfo(c, ConsoleKey.NoName, false, false, false))
        }
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.False(modal.WasCancelled)
        Assert.NotNull(modal.Result)
        Assert.Equal("alice@example.com", modal.Result!!.Username)
        Assert.Equal("hunter2", modal.Result!!.Password)
    }

    @Fact
    func CredentialsModal_Requires_Email_And_Password() {
        let modal = CredentialsModal()
        // Empty submission stays open.
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.False(modal.IsComplete)
        // Email only — still blocked.
        for c in "alice@example.com" {
            modal.HandleKey(ConsoleKeyInfo(c, ConsoleKey.NoName, false, false, false))
        }
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.False(modal.IsComplete)
    }

    @Fact
    func CredentialsModal_Escape_Cancels() {
        let modal = CredentialsModal()
        modal.HandleKey(MakeKey(ConsoleKey.Escape))
        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
        Assert.Null(modal.Result)
    }

    @Fact
    async func TuiCallbackBroker_MFA_Posts_And_Completes() {
        let broker = TuiCallbackBroker()
        let mfaTask = broker.SolveMfaAsync(MfaChallenge(), CancellationToken.None)
        Assert.True(broker.HasPending)
        Assert.True(broker.TryDequeue(out var request))
        Assert.NotNull(request)
        Assert.IsType[MfaChallenge](request.Challenge)
        request.Completion.TrySetResult("123456")
        let result = await mfaTask
        Assert.Equal("123456", result)
    }

    @Fact
    async func TuiCallbackBroker_ExternalLogin_Posts_And_Completes() {
        let broker = TuiCallbackBroker()
        let uri = Uri("https://audible.com/login")
        let loginTask = broker.CompleteExternalLoginAsync(ExternalLoginChallenge(uri), CancellationToken.None)
        Assert.True(broker.TryDequeue(out var request))
        Assert.NotNull(request)
        request.Completion.TrySetResult("https://localhost/callback?code=abc")
        let result = await loginTask
        Assert.Equal("https://localhost/callback?code=abc", result.ToString())
    }

    @Fact
    func PulseSpinner_Cycles_Frames_With_Constant_Width() {
        let spinner = PulseSpinner()
        let glyphs = List[string]()
        for var i = 0; i < 12; i++ {
            glyphs.Add(spinner.Glyph)
            spinner.Tick()
        }
        // All glyphs are exactly one character (single-width design contract).
        Assert.All(glyphs, (g string) -> Assert.Equal(1, g.Length))
        // The set of frames seen should be more than one (the spinner cycles).
        Assert.True(HashSet[string](glyphs).Count > 1)
    }

    @Fact
    func PulseSpinner_UseAscii_Renders_Static_Asterisk() {
        let spinner = PulseSpinner{UseAscii: true}
        for var i = 0; i < 5; i++ {
            Assert.Equal("*", spinner.Glyph)
            spinner.Tick()
        }
    }

    @Fact
    func SignInFlow_Start_Sets_State() {
        let state = AppShellState()
        let broker = TuiCallbackBroker()
        let flow = SignInFlow(SignInFlowTests.FakeAuthService(), SignInFlowTests.FakeLibraryService(), broker, state)
        Assert.False(flow.IsRunning)
        flow.Start(CliRegion.Us, AuthCredentials("alice@example.com", "secret"))
        Assert.True(flow.IsRunning)
        Assert.Equal("signing in…", state.ActivityVerb)
    }

    @Fact
    func AppShell_Modal_Receives_Keys() {
        let shell = AppShell(TestConsole{Profile: {Width = 80, Height = 30}})
        let modal = RegionPickerModal()
        shell.ShowModal(modal)
        Assert.NotNull(shell.ActiveModal)
        // Keys go to modal
        shell.Dispatch(MakeKey(ConsoleKey.DownArrow))
        shell.Dispatch(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.Equal("uk", modal.Result)
        // After completion the shell auto-dismisses so the owning screen
        // gets render ticks again.
        Assert.Null(shell.ActiveModal)
    }

    @Fact
    func AppShell_Modal_Esc_Cancels_With_Completion_Flag() {
        // Repro for the bug where the shell intercepted Esc before the modal
        // could mark itself cancelled. The modal must observe Esc so its owner
        // knows the user explicitly cancelled (vs. external dismissal).
        let shell = AppShell(TestConsole{Profile: {Width = 80, Height = 30}})
        let modal = RegionPickerModal()
        shell.ShowModal(modal)
        shell.Dispatch(MakeKey(ConsoleKey.Escape))
        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
        Assert.Null(shell.ActiveModal)
    }

    @Fact
    func AppShell_CtrlC_Dismisses_Modal() {
        let shell = AppShell(TestConsole{Profile: {Width = 80, Height = 30}})
        shell.ShowModal(RegionPickerModal())
        Assert.NotNull(shell.ActiveModal)
        let action = shell.Dispatch(ConsoleKeyInfo(char(3), ConsoleKey.C, shift: false, alt: false, control: true))
        Assert.Equal(ShellAction.Continue, action)
        Assert.Null(shell.ActiveModal)
    }

    @Fact
    func AppShell_Mutable_State_Reflects_In_Header() {
        let state = AppShellState{Profile: "bob", Region: "uk"}
        let console = TestConsole{Profile: {Width = 80, Height = 30}}
        console.EmitAnsiSequences = false
        let shell = AppShell(console, AppShellOptions{State: state})
        // Run with EOF to trigger render
        let reader = SignInFlowTests.ScriptedReader()
        shell.Run(reader)
        let output = console.Output
        Assert.Contains("bob@uk", output)
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

    private class FakeAuthService : IAuthService {
        func ListSessionsAsync(ct CancellationToken = default(CancellationToken)) Task[
            IReadOnlyList[AuthSession]
        ] -> Task.FromResult[IReadOnlyList[AuthSession]](Array.Empty[AuthSession]())

        func GetActiveAsync(ct CancellationToken = default(CancellationToken)) Task[AuthSession?] -> Task.FromResult[
            AuthSession?
        ](nil)

        func LoginAsync(
            region CliRegion,
            broker IAuthCallbackBroker,
            preAmazonUsername bool = false,
            ct CancellationToken = default(CancellationToken)
        ) Task[AuthSession] {
            // Simulate external login: the broker must be called
            return Task.FromResult(AuthSession{ProfileAlias: "test", Region: region, AccountId: "acct-1"})
        }

        func LogoutAsync(
            profileAlias string,
            ct CancellationToken = default(CancellationToken)
        ) Task -> Task.CompletedTask

        func RefreshAsync(profileAlias string, ct CancellationToken = default(CancellationToken)) Task[AuthSession] {
            throw NotImplementedException()
        }
    }

    private class FakeLibraryService : ILibraryService {
        func ListAsync(filter LibraryFilter? = nil, ct CancellationToken = default(CancellationToken)) Task[
            IReadOnlyList[LibraryItem]
        ] -> Task.FromResult[IReadOnlyList[LibraryItem]](Array.Empty[LibraryItem]())

        func GetAsync(asin string, ct CancellationToken = default(CancellationToken)) Task[
            LibraryItem?
        ] -> Task.FromResult[LibraryItem?](nil)

        func SyncAsync(profileAlias string, ct CancellationToken = default(CancellationToken)) Task[
            int32
        ] -> Task.FromResult(5)

        func EnsureFreshAsync(ct CancellationToken = default(CancellationToken)) Task -> Task.CompletedTask

        func RefreshAsync(ct CancellationToken = default(CancellationToken)) Task -> Task.CompletedTask
    }

    shared {
        private func MakeKey(
            key ConsoleKey,
            ch char = '\u0000',
            mod ConsoleModifiers = ConsoleModifiers.None
        ) ConsoleKeyInfo -> ConsoleKeyInfo(
            ch,
            key,
            shift: (mod & ConsoleModifiers.Shift) != 0,
            alt: (mod & ConsoleModifiers.Alt) != 0,
            control: (mod & ConsoleModifiers.Control) != 0
        )
    }
}
