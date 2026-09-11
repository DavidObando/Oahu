package Oahu.Cli.Tui.Shell

import System
import System.Collections.Generic
import System.IO
import System.Linq
import Oahu.Cli.App.Errors
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Logging
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Rendering
import Microsoft.Extensions.Logging
import Oahu.Cli.App.Auth
import Oahu.Cli.Tui.Tokens
import System.Threading
import System.Threading.Tasks

/// The top-level TUI controller, per design §3.4 / §6 / §10 and the TUI-exploration §1.
///
/// Phase 6 deliverable: an empty-but-navigable shell.
/// Phase 7 additions: modal overlays, mutable header state, broker polling.
/// Phase 8 additions: tab-lifecycle hooks ((cref:ITabScreen.OnActivated) /
/// (cref:ITabScreen.OnDeactivated) / (cref:ITabScreen.OnShutdown)),
/// (cref:IAppShellNavigator) implementation for screens that need to
/// switch tabs / open modals / raise toasts, and OSC 9;4 progress emission via
/// (cref:ITerminalProgressProvider).
///
/// • Header (app name, profile/region, activity verb, version)
/// • Tab strip (Home, Library, Queue, Jobs, History, Settings)
/// • Body (delegated to (cref:ITabScreen.Render), or a modal overlay)
/// • Pinned hint bar (global + per-screen hints)
/// • Logs overlay (toggled with `L`)
/// • Progressive Ctrl+C state machine
/// • Alt-screen entry / exit with full restoration on crash
class AppShell : IAppShellNavigator {
    /// Source of key presses. The production path uses (cref:ConsoleKeyReader);
    /// tests inject deterministic key streams.
    interface IKeyReader {
        /// Block until a key is available, then return it. Return null to signal EOF (exit).
        func ReadKey() ConsoleKeyInfo?;

        /// Try to read a key within [`millisecondsTimeout`](paramref) ms.
        /// Returns false (and key = default) if no key was pressed before the timeout.
        /// Default implementation falls back to blocking (cref:ReadKey).
        func TryReadKey(millisecondsTimeout int32, out key ConsoleKeyInfo) bool {
            // Default: blocking read (for tests / simple readers).
            let result = ReadKey()
            if result == nil {
                key = default(ConsoleKeyInfo)
                return false
            }
            key = result
            return true
        }
    }

    private let console IAnsiConsole
    private let options AppShellOptions
    private let tabs IReadOnlyList[ITabScreen]
    private let ctrlC CtrlCState
    private let loadSpinner PulseSpinner = PulseSpinner()
    private var activeTab int32
    private var lastRenderedTab int32 = -1
    private var logsOpen bool
    private var toast string?
    private var toastShownAt DateTimeOffset?
    private var activeModal IModal?
    private var activeBroker TuiCallbackBroker?
    private var needsTimedRefresh bool

    // Shell-managed loading: the shell tracks the async load task returned by
    // OnActivatedAsync (or TrackLoad) and renders a spinner while it's pending.
    // screenLoadPending is only cleared inside Render() after the task completes,
    // which guarantees at least one post-load render before blocking on input.
    private var screenLoadTask Task?

    private var screenLoadPending bool

    init(console IAnsiConsole, options AppShellOptions? = nil) {
        ArgumentNullException.ThrowIfNull(console)
        this.console = console
        this.options = options ?? AppShellOptions()
        tabs = this.options.Tabs ?? DefaultTabs.Create()
        if tabs.Count == 0 {
            throw ArgumentException("AppShell requires at least one tab.", "options")
        }
        ctrlC = CtrlCState()
    }

    prop ActiveTab int32 -> activeTab
    prop LogsOpen bool -> logsOpen
    prop Tabs IReadOnlyList[ITabScreen] -> tabs
    prop ActiveModal IModal? -> activeModal

    /// Show a modal overlay. Keys route to the modal until it completes.
    func ShowModal(modal IModal) {
        activeModal = modal ?? throw ArgumentNullException("modal")
    }

    /// Dismiss the active modal.
    func DismissModal() {
        activeModal = nil
    }

    /// Set a broker to poll for modal requests from background auth.
    func SetBroker(broker TuiCallbackBroker?) -> activeBroker = broker

    /// ```xmldoc
    /// <inheritdoc />
    /// ```
    func TrackLoad(loadTask Task) {
        ArgumentNullException.ThrowIfNull(loadTask)
        screenLoadTask = loadTask
        screenLoadPending = true
    }

    /// True when a shell-managed load task is pending (for test assertions).
    prop IsLoadPending bool -> screenLoadPending

    /// Switch to a specific tab by index.
    func SwitchTab(index int32) {
        if index >= 0 && index < tabs.Count && index != activeTab {
            ChangeActiveTab(index)
        }
    }

    /// Switch to the tab whose (cref:ITabScreen.NumberKey) matches.
    func SwitchToTab(numberKey char) {
        for var i = 0;
        i < tabs.Count;
        i++ {
            if tabs[i].NumberKey == numberKey {
                SwitchTab(i)
                return
            }
        }
    }

    /// Show a transient toast (warning style). Cleared on next key press.
    func ShowToast(message string) {
        toast = message ?? string.Empty
        toastShownAt = DateTimeOffset.UtcNow
    }

    private func ChangeActiveTab(newIndex int32) {
        let oldIndex = activeTab
        if oldIndex >= 0 && oldIndex < tabs.Count {
            try {
                tabs[oldIndex].OnDeactivated()
            } catch {
                // Swallow lifecycle errors — UI must keep running.

            }
            // If the deactivating tab was emitting OSC 9;4 progress, clear it.
            if tabs[oldIndex] is ITerminalProgressProvider {
                EmitTerminalSequence(TerminalProgressClearSequence)
            }
        }
        activeTab = newIndex
        // Clear any stale load state from the previous screen.
        screenLoadTask = nil
        screenLoadPending = false
        try {
            let task Task? = tabs[newIndex].OnActivatedAsync(this)
            if task != nil {
                screenLoadTask = task
                screenLoadPending = true
            }
        } catch {
            // ignored

        }
    }

    /// Run the shell against an injected key reader. Returns the process exit code
    /// — `0` for a clean quit (Shift+Q or cooperative Ctrl+C from an idle
    /// shell). The `130` (SIGINT) code is reserved for the runtime
    /// force-exit path in (cref:Oahu.Cli.CliEnvironment) when the
    /// cooperative state machine fails to drain in time.
    func Run(keyReader IKeyReader) int32 {
        ArgumentNullException.ThrowIfNull(keyReader)
        try {
            try {
                let task Task? = tabs[activeTab].OnActivatedAsync(this)
                if task != nil {
                    screenLoadTask = task
                    screenLoadPending = true
                }
            } catch {
                // Lifecycle errors must not break the run loop.

            }
            Render()
            while true {
                // Poll for broker modal requests before blocking for input.
                PollBroker()
                if needsTimedRefresh {
                    // When a screen is loading, use a timed read so the render
                    // loop can re-render the spinner (~100ms ticks).
                    if keyReader.TryReadKey(100, out var timedKey) {
                        let timedAction = Dispatch(timedKey)
                        switch timedAction {
                            case ShellAction.Exit {
                                return ExitCodes.Success
                            }
                            case ShellAction.ExitSigInt {
                                return ExitCodes.Cancelled
                            }
                            default {
                                let _ = 0
                            }
                        }
                    }
                    Render()
                    continue
                }
                // When a broker is attached, poll briefly so background-arriving
                // challenges become visible promptly rather than waiting for the
                // next user keystroke. Without a broker, fall back to a fully
                // blocking read so unit tests that drive a fixed key queue exit
                // cleanly when the queue drains.
                if activeBroker != nil {
                    if keyReader.TryReadKey(250, out var idleKey) {
                        let idleAction = Dispatch(idleKey)
                        switch idleAction {
                            case ShellAction.Continue {
                                Render()
                            }
                            case ShellAction.Exit {
                                return ExitCodes.Success
                            }
                            case ShellAction.ExitSigInt {
                                return ExitCodes.Cancelled
                            }
                        }
                    } else if activeModal != nil {
                        // No key arrived — keep the modal's spinner / status
                        // animating instead of freezing the frame between
                        // background callbacks (design doc §16.1: dialog
                        // StatusLine pulses at ~12 FPS while awaiting a
                        // broker callback).
                        Render()
                    }
                    continue
                }
                let key = keyReader.ReadKey()
                if key == nil {
                    return ExitCodes.Success
                }
                let action = Dispatch(key)
                switch action {
                    case ShellAction.Continue {
                        Render()
                    }
                    case ShellAction.Exit {
                        return ExitCodes.Success
                    }
                    case ShellAction.ExitSigInt {
                        return ExitCodes.Cancelled
                    }
                }
            }
        } finally {
            // Run lifecycle teardown for every tab (give every screen a chance
            // to cancel observers, dispose handles, clear OSC, etc.).
            for var i = 0;
            i < tabs.Count;
            i++ {
                try {
                    if i == activeTab {
                        tabs[i].OnDeactivated()
                    }
                    tabs[i].OnShutdown()
                } catch {
                    // Swallow — we're tearing down anyway.

                }
            }
            // Always clear any in-flight terminal progress indicator.
            EmitTerminalSequence(TerminalProgressClearSequence)
        }
    }

    /// Dispatch a single key. Public for tests; production callers use
    /// (cref:Run(IKeyReader)).
    func Dispatch(key ConsoleKeyInfo) ShellAction {
        // Toast auto-clears on any key after the window has elapsed.
        if !ctrlC.ToastActive {
            toast = nil
            toastShownAt = nil
        }
        // Progressive Ctrl+C — handled before delegating to the active screen.
        let isCtrlC = key.Key == ConsoleKey.C && (key.Modifiers & ConsoleModifiers.Control) != 0
        if isCtrlC {
            // If a modal is open, first Ctrl+C dismisses it.
            if activeModal != nil {
                DismissModal()
                ctrlC.Reset()
                return ShellAction.Continue
            }
            switch ctrlC.OnPress() {
                case CtrlCAction.CancelActiveJob, CtrlCAction.CloseDialog {
                    toast = "Press Ctrl+C again to quit · Esc to stay"
                    toastShownAt = DateTimeOffset.UtcNow
                    return ShellAction.Continue
                }
                case CtrlCAction.PromptToExit {
                    toast = "Press Ctrl+C again to quit · Esc to stay"
                    toastShownAt = DateTimeOffset.UtcNow
                    return ShellAction.Continue
                }
                case CtrlCAction.Exit {
                    // Cooperative exit from an idle shell (the only path that
                    // sets the exit window is PromptToExit, which fires only
                    // when no job/dialog was active). This is a clean quit —
                    // the process exits 0, not 130. The 130 path is reserved
                    // for CliEnvironment's force-exit fallback when the
                    // cooperative state machine fails to drain in time.
                    return ShellAction.Exit
                }
            }
        }
        // Modal overlay gets keys first.
        if activeModal != nil {
            activeModal!!.HandleKey(key)
            // Auto-dismiss when the modal signals completion (Enter, Esc-cancel,
            // or any other terminal action). Adapters push results via their
            // own TaskCompletionSource before this point; screens that own a
            // modal directly (e.g. HomeScreen with the region picker) keep
            // their own reference and read IsComplete / Result on the next
            // render. Without this auto-dismiss, completed modals would
            // linger on screen and starve the owning screen of render ticks.
            if activeModal!!.IsComplete {
                DismissModal()
            } else if key.Key == ConsoleKey.Escape {
                // Fallback: modal chose not to handle Esc — treat it as a
                // shell-level cancel so the user is never stuck in a modal.
                DismissModal()
            }
            return ShellAction.Continue
        }
        // Logs overlay swallows its own input first.
        if logsOpen {
            switch key.Key {
                case ConsoleKey.Escape {
                    logsOpen = false
                    return ShellAction.Continue
                }
                case ConsoleKey.L when(key.Modifiers & ConsoleModifiers.Control) == 0 {
                    logsOpen = false
                    return ShellAction.Continue
                }
                default {
                    let _ = 0
                }
            }
            return ShellAction.Continue
        }
        // Esc clears toast / pending exit.
        if key.Key == ConsoleKey.Escape {
            if toast != nil {
                toast = nil
                toastShownAt = nil
                ctrlC.Reset()
                return ShellAction.Continue
            }
        }
        // Delegate to the active screen FIRST — when a screen is capturing
        // input (e.g. search mode, text editing) it returns true and global
        // navigation keys are suppressed. If the screen doesn't consume the
        // key, fall through to the global handlers below.
        if tabs[activeTab].HandleKey(key) {
            return ShellAction.Continue
        }
        // Number keys 1..9 jump to that tab.
        if key.KeyChar >= '1' && key.KeyChar <= '9' {
            let idx = key.KeyChar - '1'
            if idx < tabs.Count {
                if idx != activeTab {
                    ChangeActiveTab(idx)
                }
                return ShellAction.Continue
            }
        }
        switch key.Key {
            case ConsoleKey.Tab when(key.Modifiers & ConsoleModifiers.Shift) != 0 {
                ChangeActiveTab((activeTab - 1 + tabs.Count) % tabs.Count)
                return ShellAction.Continue
            }
            case ConsoleKey.Tab {
                ChangeActiveTab((activeTab + 1) % tabs.Count)
                return ShellAction.Continue
            }
            case ConsoleKey.L when(key.Modifiers & ConsoleModifiers.Control) != 0 {
                // Ctrl+L: clear / redraw artifacts.
                AltScreen.Clear()
                return ShellAction.Continue
            }
            case ConsoleKey.L {
                if options.LogBuffer != nil {
                    logsOpen = true
                }
                return ShellAction.Continue
            }
            case ConsoleKey.Q when(key.Modifiers & ConsoleModifiers.Shift) != 0 &&
                (key.Modifiers & (ConsoleModifiers.Control | ConsoleModifiers.Alt)) == 0 {
                // Shift+Q is the discoverable, non-SIGINT clean-quit gesture.
                // Plain `q` is reserved for screens (e.g. LibraryScreen
                // "enqueue") and is handled by the screen-first delegation
                // above; if a screen consumed it, we never reach this switch.
                return ShellAction.Exit
            }
            case ConsoleKey.Q when key.Modifiers == 0 { }
            default {
                let _ = 0
            }
        }
        return ShellAction.Continue
    }

    private func PollBroker() {
        if activeBroker == nil {
            return
        }
        // Auto-dismiss a modal that completed via background means (e.g. broker
        // resolved externally or its task was cancelled): the AppShell otherwise
        // would freeze input forever waiting on a modal it can't dismiss.
        if activeModal != nil && activeModal!!.IsComplete {
            activeModal = nil
        }
        if activeModal != nil {
            return
        }
        if activeBroker!!.TryDequeue(out var request) && request != nil {
            let modal IModal? = ModalFactory.CreateFromChallenge(request)
            if modal != nil {
                ShowModal(modal)
            } else {
                // Unknown challenge type — fail the awaiter rather than letting
                // the background auth flow hang forever.
                request.Completion.TrySetException(
                    NotSupportedException(
                        "AppShell has no modal for challenge type '${request.Challenge?.GetType().Name ?? "<null>"}'."
                    )
                )
            }
        }
    }

    private func Render() {
        let screen = tabs[activeTab]
        let width = console.Profile.Width
        let height = Math.Max(10, console.Profile.Height)
        // Leave room for chrome (header + tabs + spacers + hint bar = ~6 rows).
        let bodyHeight = Math.Max(5, height - 6)
        lastRenderedTab = activeTab
        // Choose rendering target. In a real terminal, render to a string
        // buffer so we can inject \e[K (erase-to-end-of-line) before every
        // newline and write the whole frame atomically — no flicker and no
        // residual characters from longer previous lines.
        // In tests (stdout redirected), render through the injected console
        // so that test assertions on console.Output keep working.
        let useBuffer = !Console.IsOutputRedirected
        var sw StringWriter? = nil
        var target IAnsiConsole
        if useBuffer {
            sw = StringWriter()
            sw.NewLine = "\n" // Force LF — the post-process step injects \e[K before each \n.
            target = AnsiConsole.Create(
                AnsiConsoleSettings{
                    Ansi: AnsiSupport.Yes,
                    ColorSystem: ColorSystemSupport.TrueColor,
                    Out: AnsiConsoleOutput(sw),
                    Interactive: InteractionSupport.No
                }
            )
            target.Profile.Width = width
        } else {
            target = console
        }
        // Header.
        let headerText = BuildHeader(width)
        target.Write(Markup(headerText))
        target.WriteLine()
        target.Write(Rule{Style: Style(Tokens.BorderNeutral)})
        // Tabs.
        TabStrip{
            Titles: tabs.Select((t ITabScreen) -> t.Title).ToArray(),
            ActiveIndex: activeTab,
            UseAscii: options.UseAscii
        }.Write(target)
        target.Write(Rule{Style: Style(Tokens.BorderNeutral)})
        // Body: modal > logs > shell-managed loading spinner > tab screen.
        if activeModal != nil {
            target.Write(activeModal!!.Render(width, bodyHeight))
        } else if logsOpen && options.LogBuffer is {} buf {
            target.Write(RenderLogsOverlay(buf, width, bodyHeight))
        } else if screenLoadPending {
            // Reconcile: if the task has completed, clear pending so this
            // frame renders the actual screen content (not the spinner).
            let lt Task? = screenLoadTask
            if lt != nil && lt.IsCompleted {
                screenLoadPending = false
                screenLoadTask = nil
                target.Write(screen.Render(width, bodyHeight))
            } else {
                target.Write(RenderLoadSpinner(screen.Title))
            }
        } else {
            target.Write(screen.Render(width, bodyHeight))
        }
        // Hint bar — global + per-screen + toast.
        target.WriteLine()
        target.Write(Rule{Style: Style(Tokens.BorderNeutral)})
        if toast != nil {
            let c = Tokens.StatusWarning.Value.ToMarkup()
            target.Write(Markup("[$c] ! ${Markup.Escape(toast!!)}[/]"))
            target.WriteLine()
        } else {
            BuildHintBar(screen).Write(target)
        }
        // OSC 9;4 progress sequence (terminal title-bar / dock indicator).
        // Active screen may opt-in by implementing ITerminalProgressProvider.
        let oscSequence = (screen as ITerminalProgressProvider)?.GetTerminalProgressSequence()
        if useBuffer && sw != nil {
            // Inject \e[K before every \n so each line clears trailing chars,
            // then write \e[H (home) + frame + \e[K\e[J (erase rest) atomically.
            // OSC 9;4 (if any) appended last so it doesn't interfere with the
            // visible frame.
            //
            // The whole payload is wrapped in DEC mode 2026 (synchronized update)
            // so the terminal buffers all output and paints the complete frame in
            // one pass, eliminating partial-frame flicker. Terminals that don't
            // understand mode 2026 silently ignore it.
            let frame = AltScreen.InjectEraseBeforeNewlines(sw.ToString())
            Console.Out.Write(
                "${AltScreen.SyncStartSequence}\u001B[H$frame\u001B[K\u001B[J$oscSequence${AltScreen.SyncEndSequence}"
            )
            Console.Out.Flush()
        } else if !string.IsNullOrEmpty(oscSequence) {
            // Tests / redirected stdout: still let progress assertions see it.
            Console.Out.Write(oscSequence)
            Console.Out.Flush()
        }
        // Shell-managed load tasks drive timed refresh independently of
        // the screen's own NeedsTimedRefresh (which covers screen-specific
        // continuous refresh like JobsScreen's observer or mutation spinners).
        needsTimedRefresh = screenLoadPending || screen.NeedsTimedRefresh || (activeBroker?.HasPending ?? false)
    }

    private func BuildHeader(width int32) string {
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        var profile string
        var verb string
        if options.State is {} st {
            profile = st.ProfileDisplay
            verb = st.ActivityVerb
        } else {
            profile = if string.IsNullOrEmpty(options.Profile) {
                "(not signed in)"
            } else {
                (
                    if !string.IsNullOrEmpty(options.Region) {
                        "${options.Profile}@${options.Region}"
                    } else {
                        options.Profile
                    }
                )
            }
            verb = options.ActivityVerb?() ?? "idle"
        }
        if string.IsNullOrEmpty(verb) {
            verb = "idle"
        }
        let version = if string.IsNullOrEmpty(options.Version) {
            string.Empty
        } else {
            "v${options.Version}"
        }
        return string.Concat(
            "[$brand bold]oahu[/]",
            "  [$tertiary]·[/]  ",
            "[$secondary]${Markup.Escape(profile)}[/]",
            "  [$tertiary]·[/]  ",
            "[$primary]${Markup.Escape(verb)}[/]",
            "  [$tertiary]·[/]  ",
            "[$tertiary]${Markup.Escape(version)}[/]"
        )
    }

    private func BuildHintBar(screen ITabScreen) HintBar {
        let bar = HintBar{UseAscii: options.UseAscii}
            .Add("1-6", "tabs")
            .Add("Tab", "next")
            .Add("?", "help")
            .Add(
            "L",
            if options.LogBuffer != nil {
                "logs"
            } else {
                default(string?)
            }
        )
            .Add("Q", "quit")
            .Add("Ctrl+C", "quit")
        bar.AddRange(screen.Hints)
        return bar
    }

    private func RenderLogsOverlay(buf LogRingBuffer, width int32, height int32) IRenderable {
        let snapshot = buf.Snapshot()
        let lines = List[IRenderable](Math.Min(snapshot.Count, height) + 2)
        lines.Add(
            Markup(
                "[${Tokens.TextPrimary.Value.ToMarkup()} bold]Logs[/]  [${Tokens.TextTertiary.Value.ToMarkup()}](${snapshot.Count}/${buf.Capacity})[/]"
            )
        )
        lines.Add(Markup(string.Empty))
        let startIndex = Math.Max(0, snapshot.Count - (height - 4))
        for var i = startIndex;
        i < snapshot.Count;
        i++ {
            let entry = snapshot[i]
            let color = switch entry.Level {
                case LogLevel.Warning: Tokens.StatusWarning
                case LogLevel.Error: Tokens.StatusError
                case LogLevel.Critical: Tokens.StatusError
                case LogLevel.Debug: Tokens.TextTertiary
                case LogLevel.Trace: Tokens.TextTertiary
                default: Tokens.TextSecondary
            }
            lines.Add(Markup("[${color.Value.ToMarkup()}]${Markup.Escape(entry.FormatLine())}[/]"))
        }
        return Padder(Rows(lines)).Padding(2, 1, 2, 1)
    }

    /// Shell-owned loading spinner rendered while a screen's load task is pending.
    private func RenderLoadSpinner(screenTitle string) IRenderable {
        let b = Tokens.Brand.Value.ToMarkup()
        let s = Tokens.TextSecondary.Value.ToMarkup()
        return Padder(
            Rows(
                []IRenderable{
                    Markup(
                        "${loadSpinner.RenderMarkup()} [$s]Loading ${Markup.Escape(screenTitle.ToLowerInvariant())}…[/]"
                    )
                }
            )
        ).Padding(2, 1, 2, 1)
    }

    /// Console-backed key reader used by the production path.
    class ConsoleKeyReader : IKeyReader {
        func ReadKey() ConsoleKeyInfo? {
            try {
                return Console.ReadKey(intercept: true)
            } catch (InvalidOperationException) {
                // Stdin redirected mid-flight — treat as EOF.
                return nil
            }
        }

        func TryReadKey(millisecondsTimeout int32, out key ConsoleKeyInfo) bool {
            try {
                let deadline = Environment.TickCount64 + int64(millisecondsTimeout)
                while Environment.TickCount64 < deadline {
                    if Console.KeyAvailable {
                        key = Console.ReadKey(intercept: true)
                        return true
                    }
                    Thread.Sleep(10)
                }
                key = default(ConsoleKeyInfo)
                return false
            } catch (InvalidOperationException) {
                key = default(ConsoleKeyInfo)
                return false
            }
        }
    }

    shared {
        /// OSC 9;4 clear sequence — removes the terminal title-bar / dock progress indicator.
        const TerminalProgressClearSequence string = "\u001B]9;4;0;0\u001B\\"

        private func EmitTerminalSequence(seq string) {
            try {
                Console.Out.Write(seq)
                Console.Out.Flush()
            } catch {
                // ignore

            }
        }
    }
}

/// Possible outcomes of a single key dispatch.
enum ShellAction {
    Continue,
    Exit,
    ExitSigInt
}

/// Creates modal overlays from broker challenge requests.
internal class ModalFactory {
    /// Wraps ExternalLoginModal and sets the completion source when done.
    private class ExternalLoginModalAdapter : IModal {
        private let inner ExternalLoginModal
        private let request ModalRequest

        init(loginUri Uri, request ModalRequest) {
            inner = ExternalLoginModal(loginUri)
            this.request = request
        }

        prop IsComplete bool -> inner.IsComplete
        prop WasCancelled bool -> inner.WasCancelled

        func Render(width int32, height int32) IRenderable -> inner.Render(width, height)

        func HandleKey(key ConsoleKeyInfo) bool {
            let result = inner.HandleKey(key)
            if inner.IsComplete {
                if inner.WasCancelled {
                    request.Completion.TrySetCanceled()
                } else if inner.Result != nil {
                    request.Completion.TrySetResult(inner.Result!!.ToString())
                }
            }
            return result
        }
    }

    /// Wraps ChallengeModal and sets the completion source when done.
    private class ChallengeModalAdapter : IModal {
        private let inner ChallengeModal
        private let request ModalRequest

        init(inner ChallengeModal, request ModalRequest) {
            this.inner = inner
            this.request = request
        }

        prop IsComplete bool -> inner.IsComplete
        prop WasCancelled bool -> inner.WasCancelled

        func Render(width int32, height int32) IRenderable -> inner.Render(width, height)

        func HandleKey(key ConsoleKeyInfo) bool {
            let result = inner.HandleKey(key)
            if inner.IsComplete {
                if inner.WasCancelled {
                    request.Completion.TrySetCanceled()
                } else if inner.Result != nil {
                    request.Completion.TrySetResult(inner.Result!!)
                }
            }
            return result
        }
    }

    shared {
        func CreateFromChallenge(request ModalRequest) IModal? {
            return switch request.Challenge {
                case ext is ExternalLoginChallenge: cast[IModal](ExternalLoginModalAdapter(ext.LoginUri, request))
                case _ is MfaChallenge: cast[IModal](
                    ChallengeModalAdapter(
                        ChallengeModal{Title: "MFA Required", Instructions: "Enter the code sent to your device:"},
                        request
                    )
                )
                case _ is CvfChallenge: cast[IModal](
                    ChallengeModalAdapter(
                        ChallengeModal{Title: "Verification Required", Instructions: "Enter the verification code:"},
                        request
                    )
                )
                case _ is CaptchaChallenge: cast[IModal](
                    ChallengeModalAdapter(
                        ChallengeModal{Title: "CAPTCHA Required", Instructions: "Enter the text shown in the CAPTCHA:"},
                        request
                    )
                )
                case _ is ApprovalChallenge: cast[IModal](
                    ChallengeModalAdapter(
                        ChallengeModal{
                            Title: "Approval Required",
                            Instructions: "Approve the sign-in on your trusted device, then press Enter.",
                            ApprovalOnly: true
                        },
                        request
                    )
                )
                default: nil
            }
        }
    }
}
