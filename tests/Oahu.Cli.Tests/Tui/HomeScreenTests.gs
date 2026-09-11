package Oahu.Cli.Tests.Tui

import System
import System.Collections.Generic
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Xunit
import Oahu.Cli.Tui.Auth
import System.Threading
import System.Threading.Tasks

@Collection("EnvVarSerial")
class HomeScreenTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() -> Theme.Reset()

    @Fact
    func Render_Shows_Not_Signed_In_When_No_Profile() {
        let screen = CreateScreen()
        let r = screen.Render(80, 20)
        Assert.NotNull(r)
    }

    @Fact
    func Render_Shows_Profile_When_Signed_In() {
        let state = AppShellState{Profile: "alice", Region: "us"}
        let screen = CreateScreen(state)
        let r = screen.Render(80, 20)
        Assert.NotNull(r)
    }

    @Fact
    func S_Key_Fires_SignIn_When_Not_Signed_In() {
        let screen = CreateScreen()
        var fired = false
        screen.OnSignInRequested = () -> {
            fired = true
        }
        screen.HandleKey(Key('s', ConsoleKey.S))
        Assert.True(fired)
    }

    @Fact
    func S_Key_Ignored_When_Signed_In() {
        let state = AppShellState{Profile: "alice"}
        let screen = CreateScreen(state)
        var fired = false
        screen.OnSignInRequested = () -> {
            fired = true
        }
        screen.HandleKey(Key('s', ConsoleKey.S))
        Assert.False(fired)
    }

    @Fact
    func S_Key_Opens_Region_Picker_When_Navigator_Available() {
        let screen = CreateScreen()
        let nav = RecordingNavigator()
        screen.OnActivatedAsync(nav)
        screen.HandleKey(Key('s', ConsoleKey.S))
        Assert.NotNull(nav.LastModal)
        Assert.IsType[RegionPickerModal](nav.LastModal)
    }

    @Fact
    func Region_Cancel_Tears_Down_Without_Starting_Flow() {
        let screen = CreateScreen()
        let nav = RecordingNavigator()
        screen.OnActivatedAsync(nav)
        screen.HandleKey(Key('s', ConsoleKey.S))
        let modal = cast[RegionPickerModal](nav.LastModal!!)
        modal.HandleKey(Key(char(0), ConsoleKey.Escape))
        // First Render after completion drives the state machine forward.
        screen.Render(80, 20)
        Assert.False(screen.NeedsTimedRefresh)
        Assert.Null(nav.LastBroker)
    }

    @Fact
    func S_Key_Works_Again_After_External_Modal_Dismissal() {
        // Repro for the bug where Esc-via-shell left HomeScreen thinking a
        // modal was still pending, so the next `s` press silently did nothing.
        let screen = CreateScreen()
        let nav = RecordingNavigator()
        screen.OnActivatedAsync(nav)
        screen.HandleKey(Key('s', ConsoleKey.S))
        let firstModal = nav.LastModal
        Assert.NotNull(firstModal)
        // Simulate AppShell's external dismiss (Ctrl+C path) without ever
        // setting modal.IsComplete.
        nav.DismissModal()
        screen.Render(80, 20)
        // Now `s` should open a fresh region picker.
        screen.HandleKey(Key('s', ConsoleKey.S))
        Assert.NotNull(nav.LastModal)
        Assert.NotSame(firstModal, nav.LastModal)
    }

    @Fact
    func Region_Selection_Advances_To_Credentials_Modal() {
        let screen = CreateScreen()
        let nav = RecordingNavigator()
        screen.OnActivatedAsync(nav)
        screen.HandleKey(Key('s', ConsoleKey.S))
        let region = cast[RegionPickerModal](nav.LastModal!!)
        region.HandleKey(Key(char(0), ConsoleKey.Enter))
        // Render runs the state machine: it should swap the modal to
        // CredentialsModal (default to programmatic / username+password flow,
        // matching the Avalonia GUI's "direct login" path).
        screen.Render(80, 20)
        Assert.NotNull(nav.LastModal)
        Assert.IsType[CredentialsModal](nav.LastModal)
        Assert.Null(nav.LastBroker)
    }

    @Fact
    func S_Key_Works_Again_After_External_Credentials_Dismissal() {
        let screen = CreateScreen()
        let nav = RecordingNavigator()
        screen.OnActivatedAsync(nav)
        screen.HandleKey(Key('s', ConsoleKey.S))
        let region = cast[RegionPickerModal](nav.LastModal!!)
        region.HandleKey(Key(char(0), ConsoleKey.Enter))
        screen.Render(80, 20)
        Assert.IsType[CredentialsModal](nav.LastModal)
        nav.DismissModal()
        screen.Render(80, 20)
        screen.HandleKey(Key('s', ConsoleKey.S))
        Assert.IsType[RegionPickerModal](nav.LastModal)
    }

    @Fact
    func Title_Is_Home() {
        let screen = CreateScreen()
        Assert.Equal("Home", screen.Title)
        Assert.Equal('1', screen.NumberKey)
    }

    @Fact
    async func R_Key_Triggers_Cache_Busting_Refresh_And_Invalidates_Library() {
        // Repro for the bug where pressing 'r' on Home only re-read the cached
        // local library — newly purchased titles never appeared until restart.
        let state = AppShellState{Profile: "alice", Region: "us"}
        let lib = CountingLibraryService()
        let screen = HomeScreen(
            state,
            func () IAuthService {
                return HomeScreenTests.FakeAuthService()
            },
            func () ILibraryService {
                return lib
            }
        )
        let nav = RecordingNavigator()
        let activation Task? = screen.OnActivatedAsync(nav)
        if activation != nil {
            await activation
        }
        let initialGeneration = state.LibraryGeneration
        let consumed = screen.HandleKey(Key('r', ConsoleKey.R))
        Assert.True(consumed)
        // BeginRefresh runs on the thread pool and is tracked by the navigator.
        let refreshTask = nav.LastTrackedLoad
        Assert.NotNull(refreshTask)
        await refreshTask!!
        Assert.True(lib.RefreshCallCount >= 1, "Expected RefreshAsync to bypass the once-per-process cache.")
        Assert.True(
            state.LibraryGeneration > initialGeneration,
            "LibraryGeneration should bump so the Library tab reloads."
        )
    }

    private class CountingLibraryService : ILibraryService {
        var RefreshCallCount int32
        func ListAsync(filter LibraryFilter? = nil, ct CancellationToken = default(CancellationToken)) Task[
            IReadOnlyList[LibraryItem]
        ] -> Task.FromResult[IReadOnlyList[LibraryItem]](Array.Empty[LibraryItem]())

        func GetAsync(asin string, ct CancellationToken = default(CancellationToken)) Task[
            LibraryItem?
        ] -> Task.FromResult[LibraryItem?](nil)

        func SyncAsync(profileAlias string, ct CancellationToken = default(CancellationToken)) Task[
            int32
        ] -> Task.FromResult(0)

        func EnsureFreshAsync(ct CancellationToken = default(CancellationToken)) Task -> Task.CompletedTask

        func RefreshAsync(ct CancellationToken = default(CancellationToken)) Task {
            Interlocked.Increment(&RefreshCallCount)
            return Task.CompletedTask
        }
    }

    private class RecordingNavigator : IAppShellNavigator {
        prop LastModal IModal? {
            get;
            private set;
        }

        prop LastToast string? {
            get;
            private set;
        }

        prop DismissCalled bool {
            get;
            private set;
        }

        prop LastBroker TuiCallbackBroker? {
            get;
            private set;
        }

        prop LastTrackedLoad Task? {
            get;
            private set;
        }

        prop ActiveModal IModal? -> LastModal

        func SwitchToTab(numberKey char) { }

        func ShowModal(modal IModal) -> LastModal = modal

        func ShowToast(message string) -> LastToast = message

        func DismissModal() {
            DismissCalled = true
            LastModal = nil
        }

        func SetBroker(broker TuiCallbackBroker?) -> LastBroker = broker

        func TrackLoad(loadTask Task) -> LastTrackedLoad = loadTask
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
            throw NotImplementedException()
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
        ] -> Task.FromResult(0)

        func EnsureFreshAsync(ct CancellationToken = default(CancellationToken)) Task -> Task.CompletedTask

        func RefreshAsync(ct CancellationToken = default(CancellationToken)) Task -> Task.CompletedTask
    }

    shared {
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

        private func CreateScreen(state AppShellState? = nil) HomeScreen {
            var state = state
            state ??= AppShellState()
            return HomeScreen(
                state!!,
                func () IAuthService {
                    return HomeScreenTests.FakeAuthService()
                },
                func () ILibraryService {
                    return HomeScreenTests.FakeLibraryService()
                }
            )
        }
    }
}
