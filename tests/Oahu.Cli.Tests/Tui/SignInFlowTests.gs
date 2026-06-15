// G# port of Tui/SignInFlowTests.cs.
//
// Recovered on 0.1.534: AppShell_Mutable_State_Reflects_In_Header
// (gsharp#659 fixed DIM + out interface impl, IKeyReader now implementable).
//
// WORKAROUNDS:
// - gsharp#537: `for c in string` → .ToCharArray().
// - gsharp#502: async tests → .GetAwaiter().GetResult().
// - GS9002: out params → pass by reference with `&`.

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
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Rendering
import Spectre.Console.Testing
import Xunit

class SignInFlowTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() {
        Theme.Reset()
    }

    func MakeKey(key ConsoleKey) ConsoleKeyInfo {
        return ConsoleKeyInfo(char(0), key, false, false, false)
    }

    func TypeString(modal ExternalLoginModal, s string) {
        for c in s.ToCharArray() {
            modal.HandleKey(ConsoleKeyInfo(c, ConsoleKey.NoName, false, false, false))
        }
    }

    func TypeStringOnCreds(modal CredentialsModal, s string) {
        for c in s.ToCharArray() {
            modal.HandleKey(ConsoleKeyInfo(c, ConsoleKey.NoName, false, false, false))
        }
    }

    func TypeStringOnChallenge(modal ChallengeModal, s string) {
        for c in s.ToCharArray() {
            modal.HandleKey(ConsoleKeyInfo(c, ConsoleKey.NoName, false, false, false))
        }
    }

    func MakeConsole() IAnsiConsole {
        return AnsiConsole.Create(AnsiConsoleSettings())
    }

    @Fact
    func RegionPicker_Returns_Selected_Region() {
        var modal = RegionPickerModal()
        Assert.False(modal.IsComplete)
        modal.HandleKey(MakeKey(ConsoleKey.DownArrow))
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.False(modal.WasCancelled)
        Assert.Equal("uk", modal.Result)
    }

    @Fact
    func RegionPicker_Escape_Cancels() {
        var modal = RegionPickerModal()
        modal.HandleKey(MakeKey(ConsoleKey.Escape))
        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
    }

    @Fact
    func RegionPicker_First_Item_Is_US() {
        var modal = RegionPickerModal()
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.Equal("us", modal.Result)
    }

    @Fact
    func ExternalLogin_Accepts_Valid_Url() {
        var modal = ExternalLoginModal(Uri("https://audible.com/login?code=abc"))
        Assert.False(modal.IsComplete)
        TypeString(modal, "https://localhost/callback?code=x")
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.False(modal.WasCancelled)
        Assert.Equal("https://localhost/callback?code=x", modal.Result!!.ToString())
    }

    @Fact
    func ExternalLogin_Rejects_Invalid_Url() {
        var modal = ExternalLoginModal(Uri("https://audible.com/login"))
        TypeString(modal, "not-a-url")
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.False(modal.IsComplete)
    }

    @Fact
    func ExternalLogin_Escape_Cancels() {
        var modal = ExternalLoginModal(Uri("https://audible.com/login"))
        modal.HandleKey(MakeKey(ConsoleKey.Escape))
        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
    }

    @Fact
    func ChallengeModal_Accepts_Text() {
        var modal = ChallengeModal() { Title = "MFA", Instructions = "Enter code:" }
        TypeStringOnChallenge(modal, "123456")
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.Equal("123456", modal.Result)
    }

    @Fact
    func ChallengeModal_Approval_Requires_Only_Enter() {
        var modal = ChallengeModal() { Title = "Approval", Instructions = "Approve on device.", ApprovalOnly = true }
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.Equal("", modal.Result)
    }

    @Fact
    func CredentialsModal_Submits_Username_And_Password() {
        var modal = CredentialsModal("us")
        TypeStringOnCreds(modal, "alice@example.com")
        modal.HandleKey(ConsoleKeyInfo(char(9), ConsoleKey.Tab, false, false, false))
        TypeStringOnCreds(modal, "hunter2")
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.False(modal.WasCancelled)
        Assert.NotNull(modal.Result)
        Assert.Equal("alice@example.com", modal.Result!!.Username)
        Assert.Equal("hunter2", modal.Result!!.Password)
    }

    @Fact
    func CredentialsModal_Requires_Email_And_Password() {
        var modal = CredentialsModal()
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.False(modal.IsComplete)
        TypeStringOnCreds(modal, "alice@example.com")
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.False(modal.IsComplete)
    }

    @Fact
    func CredentialsModal_Escape_Cancels() {
        var modal = CredentialsModal()
        modal.HandleKey(MakeKey(ConsoleKey.Escape))
        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
        Assert.Null(modal.Result)
    }

    @Fact
    func TuiCallbackBroker_MFA_Posts_And_Completes() {
        var broker = TuiCallbackBroker()
        var mfaTask = broker.SolveMfaAsync(MfaChallenge(), CancellationToken.None)
        Assert.True(broker.HasPending)
        var request ModalRequest? = nil
        Assert.True(broker.TryDequeue(&request))
        Assert.NotNull(request)
        request!!.Completion.TrySetResult("123456")
        var result = mfaTask.GetAwaiter().GetResult()
        Assert.Equal("123456", result)
    }

    @Fact
    func TuiCallbackBroker_ExternalLogin_Posts_And_Completes() {
        var broker = TuiCallbackBroker()
        var uri = Uri("https://audible.com/login")
        var loginTask = broker.CompleteExternalLoginAsync(ExternalLoginChallenge(uri), CancellationToken.None)
        var request ModalRequest? = nil
        Assert.True(broker.TryDequeue(&request))
        Assert.NotNull(request)
        request!!.Completion.TrySetResult("https://localhost/callback?code=abc")
        var result = loginTask.GetAwaiter().GetResult()
        Assert.Equal("https://localhost/callback?code=abc", result.ToString())
    }

    @Fact
    func PulseSpinner_Cycles_Frames_With_Constant_Width() {
        var spinner = PulseSpinner()
        var allSingleWidth = true
        var uniqueCount = 0
        var first = ""
        var second = ""
        var i = 0
        for i < 12 {
            var glyph = spinner.Glyph
            if glyph.Length != 1 {
                allSingleWidth = false
            }
            if uniqueCount == 0 {
                first = glyph
                uniqueCount = 1
            } else if uniqueCount == 1 && glyph != first {
                second = glyph
                uniqueCount = 2
            }
            spinner.Tick()
            i = i + 1
        }
        Assert.True(allSingleWidth)
        Assert.True(uniqueCount > 1)
    }

    @Fact
    func PulseSpinner_UseAscii_Renders_Static_Asterisk() {
        var spinner = PulseSpinner() { UseAscii = true }
        var i = 0
        for i < 5 {
            Assert.Equal("*", spinner.Glyph)
            spinner.Tick()
            i = i + 1
        }
    }

    @Fact
    func SignInFlow_Start_Sets_State() {
        var state = AppShellState()
        var broker = TuiCallbackBroker()
        let auth IAuthService = SIFakeAuthService()
        let lib ILibraryService = SIFakeLibraryService()
        var flow = SignInFlow(auth, lib, broker, state)
        Assert.False(flow.IsRunning)
        flow.Start(CliRegion.Us, AuthCredentials("alice@example.com", "secret"))
        Assert.True(flow.IsRunning)
        Assert.Equal("signing in…", state.ActivityVerb)
    }

    @Fact
    func AppShell_Modal_Receives_Keys() {
        var shell = AppShell(MakeConsole(), AppShellOptions())
        var modal = RegionPickerModal()
        shell.ShowModal(modal)
        Assert.NotNull(shell.ActiveModal)

        // Keys go to modal
        shell.Dispatch(MakeKey(ConsoleKey.DownArrow))
        shell.Dispatch(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.Equal("uk", modal.Result)

        // After completion the shell auto-dismisses
        Assert.Null(shell.ActiveModal)
    }

    @Fact
    func AppShell_Modal_Esc_Cancels_With_Completion_Flag() {
        var shell = AppShell(MakeConsole(), AppShellOptions())
        var modal = RegionPickerModal()
        shell.ShowModal(modal)

        shell.Dispatch(MakeKey(ConsoleKey.Escape))

        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
        Assert.Null(shell.ActiveModal)
    }

    @Fact
    func AppShell_CtrlC_Dismisses_Modal() {
        var console = TestConsole()
        console.Profile.Width = 80
        console.Profile.Height = 30
        let ac IAnsiConsole = console
        var shell = AppShell(ac, AppShellOptions())
        let m IModal = RegionPickerModal()
        shell.ShowModal(m)
        Assert.NotNull(shell.ActiveModal)

        var action = shell.Dispatch(ConsoleKeyInfo(char(3), ConsoleKey.C, false, false, true))
        Assert.Equal(ShellAction.Continue, action)
        Assert.Null(shell.ActiveModal)
    }

    @Fact
    func AppShell_Mutable_State_Reflects_In_Header() {
        var state = AppShellState() { Profile = "bob", Region = "uk" }
        var console = TestConsole()
        console.Profile.Width = 80
        console.Profile.Height = 30
        console.EmitAnsiSequences = false
        let ac IAnsiConsole = console
        var shell = AppShell(ac, AppShellOptions() { State = state })

        // Run with EOF to trigger render
        var reader = ScriptedReader()
        let r AppShell.IKeyReader = reader
        shell.Run(r)

        var output = console.Output
        Assert.Contains("bob@uk", output)
    }
}

class SIFakeAuthService : IAuthService {
    func ListSessionsAsync(ct CancellationToken) Task[IReadOnlyList[AuthSession]] {
        var list List[AuthSession] = List[AuthSession]()
        let r IReadOnlyList[AuthSession] = list
        return Task.FromResult(r)
    }

    func GetActiveAsync(ct CancellationToken) Task[AuthSession?] {
        let n AuthSession? = nil
        return Task.FromResult(n)
    }

    func LoginAsync(region CliRegion, broker IAuthCallbackBroker, preAmazonUsername bool, ct CancellationToken) Task[AuthSession] {
        return Task.FromResult(AuthSession() { ProfileAlias = "test", Region = region, AccountId = "acct-1" })
    }

    func LoginWithCredentialsAsync(region CliRegion, broker IAuthCallbackBroker, credentials AuthCredentials, preAmazonUsername bool, ct CancellationToken) Task[AuthSession] {
        return Task.FromResult(AuthSession() { ProfileAlias = "test", Region = region, AccountId = "acct-1" })
    }

    func LogoutAsync(profileAlias string, ct CancellationToken) Task {
        return Task.CompletedTask
    }

    func RefreshAsync(profileAlias string, ct CancellationToken) Task[AuthSession] {
        throw NotImplementedException()
        return Task.FromResult(AuthSession())
    }
}

class SIFakeLibraryService : ILibraryService {
    func ListAsync(filter LibraryFilter?, ct CancellationToken) Task[IReadOnlyList[LibraryItem]] {
        var list List[LibraryItem] = List[LibraryItem]()
        let r IReadOnlyList[LibraryItem] = list
        return Task.FromResult(r)
    }

    func GetAsync(asin string, ct CancellationToken) Task[LibraryItem?] {
        let n LibraryItem? = nil
        return Task.FromResult(n)
    }

    func SyncAsync(profileAlias string, ct CancellationToken) Task[int32] {
        return Task.FromResult(5)
    }

    func EnsureFreshAsync(ct CancellationToken) Task {
        return Task.CompletedTask
    }

    func RefreshAsync(ct CancellationToken) Task {
        return Task.CompletedTask
    }
}
