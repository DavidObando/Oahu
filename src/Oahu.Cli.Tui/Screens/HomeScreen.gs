package Oahu.Cli.Tui.Screens

import System
import System.Collections.Generic
import System.Threading.Tasks
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Rendering
import Oahu.Cli.Tui.Tokens

/// Home screen (tab 1). Shows greeting, active profile summary, and quick
/// actions. Per design TUI-exploration §2.
class HomeScreen : ITabScreen {
    private let state AppShellState
    private let authServiceFactory() -> IAuthService
    private let libraryServiceFactory() -> ILibraryService
    private let signInSpinner PulseSpinner = PulseSpinner()
    private var loaded bool
    private var libraryCount int32
    private var accountName string?
    private var refreshing bool
    private var navigator IAppShellNavigator?
    private var pendingRegionModal RegionPickerModal?
    private var pendingCredentialsModal CredentialsModal?
    private var pendingRegion CliRegion
    private var signInFlow SignInFlow?
    private var signInBroker TuiCallbackBroker?
    private var actionCursor int32

    /// One selectable quick action: display label, the key alias shown beside
    /// it, and an id the Enter handler dispatches on.
    private data struct QuickAction(Label string, KeyHint string, Id string)

    init(state AppShellState, authServiceFactory() -> IAuthService, libraryServiceFactory() -> ILibraryService) {
        this.state = state ?? throw ArgumentNullException("state")
        this.authServiceFactory = authServiceFactory ?? throw ArgumentNullException("authServiceFactory")
        this.libraryServiceFactory = libraryServiceFactory ?? throw ArgumentNullException("libraryServiceFactory")
    }

    prop Title string -> "Home"
    prop NumberKey char -> '1'

    /// True while a sign-in is in progress (the shell keeps polling the input
    /// loop so background completion is observed without a key press).
    prop NeedsTimedRefresh bool -> signInFlow != nil || pendingRegionModal != nil || pendingCredentialsModal != nil

    /// Event raised when the user picks the "sign in" action.
    prop OnSignInRequested(() -> void)?

    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get {
            yield KeyValuePair[string, string?]("↑↓", "choose")
            yield KeyValuePair[string, string?]("enter", "run")
            if !state.IsSignedIn {
                yield KeyValuePair[string, string?]("s", "sign in")
            }
            yield KeyValuePair[string, string?]("r", "refresh")
        }
    }

    /// The quick actions currently offered (depends on sign-in state).
    private func QuickActions() List[QuickAction] {
        let actions = List[QuickAction]()
        if state.IsSignedIn {
            actions.Add(QuickAction("browse the library", "2", "library"))
            actions.Add(QuickAction("review the download queue", "3", "queue"))
            actions.Add(QuickAction("watch running jobs", "4", "jobs"))
            actions.Add(QuickAction("refresh the library from Audible", "r", "refresh"))
            actions.Add(QuickAction("open settings", "6", "settings"))
        } else {
            actions.Add(QuickAction("sign in to Audible", "s", "signin"))
            actions.Add(QuickAction("open settings", "6", "settings"))
        }
        return actions
    }

    private func RunAction(id string) {
        switch id {
            case "library" {
                navigator?.SwitchToTab('2')
            }
            case "queue" {
                navigator?.SwitchToTab('3')
            }
            case "jobs" {
                navigator?.SwitchToTab('4')
            }
            case "settings" {
                navigator?.SwitchToTab('6')
            }
            case "refresh" {
                BeginRefresh()
            }
            case "signin" {
                BeginSignIn()
            }
            default {
                let _ = 0
            }
        }
    }

    func OnActivatedAsync(navigator IAppShellNavigator) Task? {
        this.navigator = navigator
        if !loaded {
            loaded = true
            return LoadAsync()
        }
        return nil
    }

    func Render(width int32, height int32) IRenderable {
        DriveSignInFlow()
        let lines = List[IRenderable]()
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        let success = Tokens.StatusSuccess.Value.ToMarkup()
        let greetName = if !string.IsNullOrEmpty(accountName) {
            ", ${accountName!!.Split(' ')[0]}"
        } else {
            string.Empty
        }
        lines.Add(Markup("[$brand bold]Aloha$greetName.[/]"))
        lines.Add(Markup("[$tertiary]Your Audible library, on the command line.[/]"))
        lines.Add(Markup(" "))
        if state.IsSignedIn {
            lines.Add(Markup("[$secondary bold]Account[/]"))
            let who = if string.IsNullOrEmpty(accountName) {
                state.ProfileDisplay
            } else {
                "${accountName} · ${state.ProfileDisplay}"
            }
            lines.Add(Markup("  [$success]●[/] [$primary]${Markup.Escape(who)}[/]"))
            lines.Add(
                Markup(
                    "  [$tertiary]$libraryCount title${(if libraryCount == 1 { "" } else { "s" })} in your library[/]"
                )
            )
            lines.Add(Markup(" "))
            lines.Add(Markup("[$secondary bold]Jump in[/]"))
            AppendQuickActions(lines)
            lines.Add(Markup(" "))
            lines.Add(Markup("[$tertiary]: runs any command · t tries another look[/]"))
        } else if signInFlow != nil {
            // Sign-in in progress (between credentials submit and any 2FA modal,
            // or while waiting on Audible to finish registration). Surface a
            // PulseSpinner + the active verb so the home screen doesn't look
            // dead while the background task is working.
            lines.Add(Markup("[$secondary]${Markup.Escape(SignInActivityMessage)}…[/]"))
            lines.Add(Markup(" "))
            let verb = if string.IsNullOrWhiteSpace(state.ActivityVerb) || string.Equals(
                state.ActivityVerb,
                "idle",
                StringComparison.Ordinal
            ) {
                "working"
            } else {
                state.ActivityVerb
            }
            lines.Add(
                Markup(
                    "${signInSpinner.RenderMarkup()} [$primary]${Markup.Escape(verb)}[/] [$tertiary]· Esc to cancel[/]"
                )
            )
        } else {
            lines.Add(Markup("[$secondary]You're not signed in yet.[/]"))
            lines.Add(Markup(" "))
            AppendQuickActions(lines)
            lines.Add(Markup(" "))
            lines.Add(Markup("[$tertiary]or from a shell: oahu-cli auth login --region us[/]"))
        }
        return Padder(Rows(lines)).Padding(2, 1, 2, 1)
    }

    /// Renders the quick-action rows with a movable cursor. The key alias
    /// beside each label still works directly, so this is discoverability
    /// sugar, not a new input mode.
    private func AppendQuickActions(lines List[IRenderable]) {
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        let actions = QuickActions()
        actionCursor = Math.Clamp(actionCursor, 0, Math.Max(0, actions.Count - 1))
        for var i = 0;
        i < actions.Count;
        i++ {
            let isCursor = i == actionCursor
            let pointer = if isCursor {
                "[$brand]❯[/]"
            } else {
                " "
            }
            let style = if isCursor {
                "bold $primary"
            } else {
                secondary
            }
            let rowText =
                "  $pointer [$style]${Markup.Escape(actions[i].Label)}[/]  [$tertiary]${Markup.Escape(actions[i].KeyHint)}[/]"
            if isCursor && Tokens.HasBackdrop {
                lines.Add(Oahu.Cli.Tui.Widgets.Backdrop(Markup(rowText), Tokens.InputBackground.Value, padLeft: 0, padRight: 1))
            } else {
                lines.Add(Markup(rowText))
            }
        }
    }

    func HandleScroll(delta int32) bool {
        actionCursor = Math.Clamp(actionCursor + delta, 0, Math.Max(0, QuickActions().Count - 1))
        return true
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        switch key.Key {
            case ConsoleKey.Escape when signInFlow != nil {
                signInFlow!!.Cancel()
                return true
            }
            case ConsoleKey.UpArrow, ConsoleKey.K {
                actionCursor = Math.Max(0, actionCursor - 1)
                return true
            }
            case ConsoleKey.DownArrow, ConsoleKey.J {
                actionCursor = Math.Min(QuickActions().Count - 1, actionCursor + 1)
                return true
            }
            case ConsoleKey.Enter {
                let actions = QuickActions()
                if actionCursor >= 0 && actionCursor < actions.Count {
                    RunAction(actions[actionCursor].Id)
                }
                return true
            }
            case ConsoleKey.S when key.Modifiers == 0 {
                if !state.IsSignedIn {
                    BeginSignIn()
                    return true
                }
            }
            case ConsoleKey.R when key.Modifiers == 0 {
                BeginRefresh()
                return true
            }
            default {
                let _ = 0
            }
        }
        return false
    }

    /// Refresh the summary data from the services (synchronous, for tests).
    func Refresh() {
        try {
            let auth = authServiceFactory()
            let session AuthSession? = auth.GetActiveAsync().GetAwaiter().GetResult()
            if session != nil {
                accountName = session.AccountName
            }
            let lib = libraryServiceFactory()
            // Force an Audible pull so a freshly-purchased title shows up
            // in the count (and propagates to the Library screen via the
            // shared LibraryGeneration token).
            lib.RefreshAsync().GetAwaiter().GetResult()
            let items = lib.ListAsync().GetAwaiter().GetResult()
            libraryCount = items.Count
            loaded = true
            state.InvalidateLibrary()
        } catch {
            loaded = true
            // Swallow — the TUI must not crash.

        }
    }

    /// Kick off a refresh on a background thread, tracked by the shell so it
    /// renders a spinner while the Audible pull is in flight. Used by the
    /// 'r' key — keeping this off the render thread avoids freezing the UI
    /// during the network round-trip.
    private func BeginRefresh() {
        if refreshing {
            return
        }
        refreshing = true
        let task = Task.Run(
            () -> {
                try {
                    let auth = authServiceFactory()
                    let session AuthSession? = auth.GetActiveAsync().GetAwaiter().GetResult()
                    if session != nil {
                        accountName = session.AccountName
                    }
                    let lib = libraryServiceFactory()
                    lib.RefreshAsync().GetAwaiter().GetResult()
                    let items = lib.ListAsync().GetAwaiter().GetResult()
                    libraryCount = items.Count
                    loaded = true
                    state.InvalidateLibrary()
                } catch {
                    // Swallow — the TUI must not crash on transient refresh errors.

                } finally {
                    refreshing = false
                }
            }
        )
        navigator?.TrackLoad(task)
    }

    /// Load data asynchronously (returned to shell for tracking).
    private func LoadAsync() Task {
        return Task.Run(
            () -> {
                try {
                    let auth = authServiceFactory()
                    let session AuthSession? = auth.GetActiveAsync().GetAwaiter().GetResult()
                    if session != nil {
                        accountName = session.AccountName
                    }
                    let lib = libraryServiceFactory()
                    let items = lib.ListAsync().GetAwaiter().GetResult()
                    libraryCount = items.Count
                } catch {
                    // Swallow — the TUI must not crash.

                }
            }
        )
    }

    private func BeginSignIn() {
        // Fire the back-compat callback (tests rely on this). Do this first so
        // even environments without a navigator still observe the request.
        OnSignInRequested?()
        // Need a navigator (production path) to drive modals; tests typically
        // don't supply one and just observe the callback.
        if navigator == nil || pendingRegionModal != nil || pendingCredentialsModal != nil || signInFlow != nil {
            return
        }
        pendingRegionModal = RegionPickerModal()
        navigator!!.ShowModal(pendingRegionModal!!)
    }

    private func DriveSignInFlow() {
        if navigator == nil {
            return
        }
        // Step 1: region picker → either advance to credentials or bail out.
        if pendingRegionModal != nil {
            // External dismissal (e.g. Ctrl+C cleared the modal without
            // setting IsComplete): treat as cancel so the screen state matches
            // what the user sees, and the next `s` press can start over.
            if !pendingRegionModal!!.IsComplete && !object.ReferenceEquals(
                navigator!!.ActiveModal,
                pendingRegionModal
            ) {
                pendingRegionModal = nil
                return
            }
            if !pendingRegionModal!!.IsComplete {
                return
            }
            let modal = pendingRegionModal
            pendingRegionModal = nil
            if modal!!.WasCancelled || string.IsNullOrEmpty(modal!!.Result) {
                return
            }
            if !TryParseRegion(modal!!.Result!!, out var region) {
                navigator!!.ShowToast("Unknown region '${modal!!.Result}'.")
                return
            }
            pendingRegion = region
            pendingCredentialsModal = CredentialsModal(region.ToString().ToLowerInvariant())
            navigator!!.ShowModal(pendingCredentialsModal!!)
            return
        }
        // Step 2: credentials modal → start the SignInFlow.
        if pendingCredentialsModal != nil {
            if !pendingCredentialsModal!!.IsComplete && !object.ReferenceEquals(
                navigator!!.ActiveModal,
                pendingCredentialsModal
            ) {
                pendingCredentialsModal = nil
                return
            }
            if !pendingCredentialsModal!!.IsComplete {
                return
            }
            let modal = pendingCredentialsModal
            pendingCredentialsModal = nil
            if modal!!.WasCancelled || modal!!.Result == nil {
                return
            }
            try {
                signInBroker = TuiCallbackBroker()
                navigator!!.SetBroker(signInBroker)
                signInFlow = SignInFlow(authServiceFactory(), libraryServiceFactory(), signInBroker!!, state)
                signInFlow!!.Start(pendingRegion, modal!!.Result!!)
            } catch (ex Exception) {
                navigator!!.ShowToast("Sign-in failed to start: ${ex.Message}")
                TeardownSignInFlow()
            }
            return
        }
        // Step 3: SignInFlow running — poll for completion / error.
        if signInFlow != nil {
            let result SignInResult? = signInFlow!!.Poll()
            if result != nil {
                // Success: state.Profile / Region are already populated by the
                // background task. Refresh the home summary and tear down.
                accountName = result.Session.AccountName
                libraryCount = result.LibraryCount
                loaded = true
                navigator!!.ShowToast(
                    "Signed in as ${result.Session.ProfileAlias} · ${result.LibraryCount} title${(if result.LibraryCount == 1 { string.Empty } else { "s" })}"
                )
                TeardownSignInFlow()
                return
            }
            if !signInFlow!!.IsRunning {
                // Failed or cancelled.
                let msg = signInFlow!!.ErrorMessage ?? "Sign-in did not complete."
                navigator!!.ShowToast(msg)
                TeardownSignInFlow()
            }
        }
    }

    private func TeardownSignInFlow() {
        try {
            signInFlow?.Dispose()
        } catch {
            // ignore — we're tearing down.

        }
        signInFlow = nil
        signInBroker = nil
        navigator?.SetBroker(nil)
    }

    shared {
        private const SignInActivityMessage string = "Signing in to Audible"

        private func TryParseRegion(code string, out region CliRegion) bool {
            return Enum.TryParse[CliRegion](code, ignoreCase: true, out region)
        }
    }
}
