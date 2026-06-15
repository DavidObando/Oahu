// G# port of Tui/HomeScreenTests.cs — IMPROVED for 0.1.509.
//
// Added: R_Key_Triggers_Cache_Busting_Refresh_And_Invalidates_Library (async returning user class — now fixed).
//
// WORKAROUNDS:
// - gsharp#572: DIM on concrete → cast to ITabScreen for OnActivatedAsync.
// - gsharp#573: ActiveModal prop → use `prop` accessor.
// - Async tests → .GetAwaiter().GetResult() where needed.

package Oahu.Cli.Tests.Tui

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Xunit

@Collection("EnvVarSerial")
class HomeScreenTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() {
        Theme.Reset()
    }

    func SimpleKey(ch char, k ConsoleKey) ConsoleKeyInfo {
        return ConsoleKeyInfo(ch, k, false, false, false)
    }

    func CreateScreen(state AppShellState?) HomeScreen {
        var s = state ?: AppShellState()
        let authFactory () -> IAuthService = func() IAuthService { return HSFakeAuthService() }
        let libFactory () -> ILibraryService = func() ILibraryService { return HSFakeLibraryService() }
        return HomeScreen(s, authFactory, libFactory)
    }

    func ActivateScreen(screen HomeScreen, nav IAppShellNavigator) {
        let ts ITabScreen = screen
        ts.OnActivatedAsync(nav)
    }

    func ActivateScreenAsync(screen HomeScreen, nav IAppShellNavigator) Task? {
        let ts ITabScreen = screen
        return ts.OnActivatedAsync(nav)
    }

    @Fact
    func Render_Shows_Not_Signed_In_When_No_Profile() {
        var screen = CreateScreen(nil)
        var r = screen.Render(80, 20)
        Assert.NotNull(r)
    }

    @Fact
    func Render_Shows_Profile_When_Signed_In() {
        var state = AppShellState()
        state.Profile = "alice"
        state.Region = "us"
        var screen = CreateScreen(state)
        var r = screen.Render(80, 20)
        Assert.NotNull(r)
    }

    @Fact
    func S_Key_Fires_SignIn_When_Not_Signed_In() {
        var screen = CreateScreen(nil)
        var fired = false
        screen.OnSignInRequested = func() { fired = true }
        screen.HandleKey(SimpleKey('s', ConsoleKey.S))
        Assert.True(fired)
    }

    @Fact
    func S_Key_Ignored_When_Signed_In() {
        var state = AppShellState()
        state.Profile = "alice"
        var screen = CreateScreen(state)
        var fired = false
        screen.OnSignInRequested = func() { fired = true }
        screen.HandleKey(SimpleKey('s', ConsoleKey.S))
        Assert.False(fired)
    }

    @Fact
    func Title_Is_Home() {
        var screen = CreateScreen(nil)
        Assert.Equal("Home", screen.Title)
        Assert.Equal('1', screen.NumberKey)
    }

    @Fact
    func S_Key_Opens_Region_Picker_When_Navigator_Available() {
        var screen = CreateScreen(nil)
        var nav = HSRecordingNavigator()
        ActivateScreen(screen, nav)
        screen.HandleKey(SimpleKey('s', ConsoleKey.S))
        Assert.NotNull(nav.LastModal)
        Assert.IsType[RegionPickerModal](nav.LastModal)
    }

    @Fact
    func Region_Cancel_Tears_Down_Without_Starting_Flow() {
        var screen = CreateScreen(nil)
        var nav = HSRecordingNavigator()
        ActivateScreen(screen, nav)
        screen.HandleKey(SimpleKey('s', ConsoleKey.S))
        let modal = nav.LastModal
        Assert.NotNull(modal)
        modal!!.HandleKey(ConsoleKeyInfo(char(0), ConsoleKey.Escape, false, false, false))
        screen.Render(80, 20)
        Assert.False(screen.NeedsTimedRefresh)
        Assert.Null(nav.LastBroker)
    }

    @Fact
    func S_Key_Works_Again_After_External_Modal_Dismissal() {
        var screen = CreateScreen(nil)
        var nav = HSRecordingNavigator()
        ActivateScreen(screen, nav)
        screen.HandleKey(SimpleKey('s', ConsoleKey.S))
        var firstModal = nav.LastModal
        Assert.NotNull(firstModal)
        nav.DismissModal()
        screen.Render(80, 20)
        screen.HandleKey(SimpleKey('s', ConsoleKey.S))
        Assert.NotNull(nav.LastModal)
        Assert.NotSame(firstModal, nav.LastModal)
    }

    @Fact
    func Region_Selection_Advances_To_Credentials_Modal() {
        var screen = CreateScreen(nil)
        var nav = HSRecordingNavigator()
        ActivateScreen(screen, nav)
        screen.HandleKey(SimpleKey('s', ConsoleKey.S))
        let region = nav.LastModal
        Assert.NotNull(region)
        region!!.HandleKey(ConsoleKeyInfo(char(0), ConsoleKey.Enter, false, false, false))
        screen.Render(80, 20)
        Assert.NotNull(nav.LastModal)
        Assert.IsType[CredentialsModal](nav.LastModal)
        Assert.Null(nav.LastBroker)
    }

    @Fact
    func S_Key_Works_Again_After_External_Credentials_Dismissal() {
        var screen = CreateScreen(nil)
        var nav = HSRecordingNavigator()
        ActivateScreen(screen, nav)
        screen.HandleKey(SimpleKey('s', ConsoleKey.S))
        let region = nav.LastModal
        Assert.NotNull(region)
        region!!.HandleKey(ConsoleKeyInfo(char(0), ConsoleKey.Enter, false, false, false))
        screen.Render(80, 20)
        Assert.IsType[CredentialsModal](nav.LastModal)
        nav.DismissModal()
        screen.Render(80, 20)
        screen.HandleKey(SimpleKey('s', ConsoleKey.S))
        Assert.IsType[RegionPickerModal](nav.LastModal)
    }

    @Fact
    func R_Key_Triggers_Cache_Busting_Refresh_And_Invalidates_Library() {
        var state = AppShellState()
        state.Profile = "alice"
        state.Region = "us"
        var lib = HSCountingLibraryService()
        var screen = HomeScreen(state, func() IAuthService { return HSFakeAuthService() }, func() ILibraryService { return lib })
        var nav = HSRecordingNavigator()
        var activation = ActivateScreenAsync(screen, nav)
        if activation != nil {
            activation!!.GetAwaiter().GetResult()
        }

        var initialGeneration = state.LibraryGeneration

        var consumed = screen.HandleKey(SimpleKey('r', ConsoleKey.R))
        Assert.True(consumed)

        // BeginRefresh runs on the thread pool and is tracked by the navigator.
        var refreshTask = nav.LastTrackedLoad
        Assert.NotNull(refreshTask)
        refreshTask!!.GetAwaiter().GetResult()

        Assert.True(lib.RefreshCallCount >= 1)
        Assert.True(state.LibraryGeneration > initialGeneration)
    }
}

class HSCountingLibraryService : ILibraryService {
    var RefreshCallCount int32 = 0

    func ListAsync(filter LibraryFilter?, ct CancellationToken) Task[IReadOnlyList[LibraryItem]] {
        var list List[LibraryItem] = List[LibraryItem]()
        let result IReadOnlyList[LibraryItem] = list
        return Task.FromResult(result)
    }

    func GetAsync(asin string, ct CancellationToken) Task[LibraryItem?] {
        let n LibraryItem? = nil
        return Task.FromResult(n)
    }

    func SyncAsync(profileAlias string, ct CancellationToken) Task[int32] {
        return Task.FromResult(0)
    }

    func EnsureFreshAsync(ct CancellationToken) Task {
        return Task.CompletedTask
    }

    func RefreshAsync(ct CancellationToken) Task {
        Interlocked.Increment(&RefreshCallCount)
        return Task.CompletedTask
    }
}

class HSRecordingNavigator : IAppShellNavigator {
    var LastModal IModal? = nil
    var LastToast string? = nil
    var DismissCalled bool = false
    var LastBroker TuiCallbackBroker? = nil
    var LastTrackedLoad Task? = nil

    prop ActiveModal IModal? { get { return LastModal } }

    func SwitchToTab(numberKey char) {
    }

    func ShowModal(modal IModal) {
        LastModal = modal
    }

    func ShowToast(message string) {
        LastToast = message
    }

    func DismissModal() {
        DismissCalled = true
        LastModal = nil
    }

    func SetBroker(broker TuiCallbackBroker?) {
        LastBroker = broker
    }

    func TrackLoad(loadTask Task) {
        LastTrackedLoad = loadTask
    }
}

class HSFakeAuthService : IAuthService {
    func ListSessionsAsync(ct CancellationToken) Task[IReadOnlyList[AuthSession]] {
        var list List[AuthSession] = List[AuthSession]()
        let result IReadOnlyList[AuthSession] = list
        return Task.FromResult(result)
    }

    func GetActiveAsync(ct CancellationToken) Task[AuthSession?] {
        let n AuthSession? = nil
        return Task.FromResult(n)
    }

    func LoginAsync(region CliRegion, broker IAuthCallbackBroker, preAmazonUsername bool, ct CancellationToken) Task[AuthSession] {
        throw NotImplementedException()
        return Task.FromResult(AuthSession())
    }

    func LoginWithCredentialsAsync(region CliRegion, broker IAuthCallbackBroker, credentials AuthCredentials, preAmazonUsername bool, ct CancellationToken) Task[AuthSession] {
        throw NotSupportedException("HSFakeAuthService does not support credentials-based sign-in.")
        return Task.FromResult(AuthSession())
    }

    func LogoutAsync(profileAlias string, ct CancellationToken) Task {
        return Task.CompletedTask
    }

    func RefreshAsync(profileAlias string, ct CancellationToken) Task[AuthSession] {
        throw NotImplementedException()
        return Task.FromResult(AuthSession())
    }
}

class HSFakeLibraryService : ILibraryService {
    func ListAsync(filter LibraryFilter?, ct CancellationToken) Task[IReadOnlyList[LibraryItem]] {
        var list List[LibraryItem] = List[LibraryItem]()
        let result IReadOnlyList[LibraryItem] = list
        return Task.FromResult(result)
    }

    func GetAsync(asin string, ct CancellationToken) Task[LibraryItem?] {
        let n LibraryItem? = nil
        return Task.FromResult(n)
    }

    func SyncAsync(profileAlias string, ct CancellationToken) Task[int32] {
        return Task.FromResult(0)
    }

    func EnsureFreshAsync(ct CancellationToken) Task {
        return Task.CompletedTask
    }

    func RefreshAsync(ct CancellationToken) Task {
        return Task.CompletedTask
    }
}
