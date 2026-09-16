package Oahu.Cli.Tui.Shell

import System
import System.Collections.Generic
import System.IO
import System.Linq
import Oahu.Cli.App.Config
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Themes
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
/// • Single-row header: brand pill + tab strip (Home, Library, Queue, Jobs, History, Settings)
/// • Body on a raised cell surface (delegated to (cref:ITabScreen.Render))
/// • Floating overlays composited over the frame: dialogs, `:` command palette,
///   `?` help, `l` logs
/// • Pinned footer: per-screen hints left, profile/activity/version status right
/// • Progressive Ctrl+C state machine; `q` is the clean-quit gesture
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

        /// Block until the next input event (key or mouse). Return null on EOF.
        /// Default implementation wraps (cref:ReadKey) so key-only readers
        /// (tests) need not change.
        func ReadEvent() ShellInputEvent? {
            let key = ReadKey()
            if key == nil {
                return nil
            }
            return ShellInputEvent.FromKey(key)
        }

        /// Try to read an input event within the timeout. Default wraps
        /// (cref:TryReadKey).
        func TryReadEvent(millisecondsTimeout int32, out ev ShellInputEvent) bool {
            if TryReadKey(millisecondsTimeout, out var key) {
                ev = ShellInputEvent.FromKey(key)
                return true
            }
            ev = default(ShellInputEvent)
            return false
        }
    }

    private let console IAnsiConsole
    private let options AppShellOptions
    private let tabs IReadOnlyList[ITabScreen]
    private let ctrlC CtrlCState
    private let loadSpinner PulseSpinner = PulseSpinner()
    private var loadFrame int32
    private var activeTab int32
    private var lastRenderedTab int32 = -1
    private var logsOpen bool
    private var toast string?
    private var toastShownAt DateTimeOffset?
    private var activeModal IModal?
    private var activeBroker TuiCallbackBroker?
    private var needsTimedRefresh bool
    private var exitRequested bool
    private var lastBodyHeight int32 = 20

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
        for var i = 0; i < tabs.Count; i++ {
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
                    if keyReader.TryReadEvent(100, out var timedEv) {
                        let timedAction = DispatchEvent(timedEv)
                        if exitRequested {
                            return ExitCodes.Success
                        }
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
                    if keyReader.TryReadEvent(250, out var idleEv) {
                        let idleAction = DispatchEvent(idleEv)
                        if exitRequested {
                            return ExitCodes.Success
                        }
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
                let inputEv = keyReader.ReadEvent()
                if inputEv == nil {
                    return ExitCodes.Success
                }
                let action = DispatchEvent(inputEv!!)
                if exitRequested {
                    return ExitCodes.Success
                }
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
            for var i = 0; i < tabs.Count; i++ {
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

    /// Dispatch a key or mouse event.
    private func DispatchEvent(ev ShellInputEvent) ShellAction {
        if ev.Key is {} key {
            return Dispatch(key)
        }
        if ev.Mouse is {} mouse {
            return DispatchMouse(mouse)
        }
        return ShellAction.Continue
    }

    /// Dispatch a single mouse event. Public for tests.
    /// Wheel scrolls the active screen; a click on the header row hits the
    /// brand pill (Home) or a tab; a click in the body is forwarded to the
    /// active screen in screen-relative coordinates.
    func DispatchMouse(ev MouseEvent) ShellAction {
        // Overlays own the keyboard; keep the mouse inert under them so a
        // stray click can't change tabs behind a dialog.
        if activeModal != nil || logsOpen {
            return ShellAction.Continue
        }
        switch ev.Kind {
            case MouseEventKind.WheelUp {
                tabs[activeTab].HandleScroll(-ScrollLinesPerNotch)
                return ShellAction.Continue
            }
            case MouseEventKind.WheelDown {
                tabs[activeTab].HandleScroll(ScrollLinesPerNotch)
                return ShellAction.Continue
            }
            case MouseEventKind.Click {
                if ev.Y == 0 {
                    // " ⏵ oahu ⏴ " brand pill occupies columns 1..6.
                    if ev.X >= 1 && ev.X <= 6 {
                        SwitchTab(0)
                        return ShellAction.Continue
                    }
                    let idx = MakeTabStrip().HitTest(ev.X - HeaderStripStart)
                    if idx >= 0 && idx < tabs.Count {
                        SwitchTab(idx)
                    }
                    return ShellAction.Continue
                }
                if ev.Y >= BodyTop && ev.Y < BodyTop + lastBodyHeight {
                    tabs[activeTab].HandleClick(Math.Max(0, ev.X - BodyLeft), ev.Y - BodyTop)
                }
                return ShellAction.Continue
            }
        }
        return ShellAction.Continue
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
        // Global overlays reachable from any screen.
        if key.KeyChar == '?' {
            ShowModal(BuildHelpOverlay())
            return ShellAction.Continue
        }
        if key.KeyChar == ':' {
            ShowModal(BuildCommandPalette())
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
            case ConsoleKey.T when key.Modifiers == 0 {
                // Cycle the theme. Screens that need `t` for themselves consume
                // it in the screen-first delegation above.
                Theme.Cycle()
                PersistTheme(Theme.Current.Name)
                toast = "Theme: ${Theme.Current.Name}"
                toastShownAt = DateTimeOffset.UtcNow
                return ShellAction.Continue
            }
            case ConsoleKey.Q when(key.Modifiers & (ConsoleModifiers.Control | ConsoleModifiers.Alt)) == 0 {
                // `q` (and the legacy Shift+Q) is the clean-quit gesture. No
                // screen binds `q` — screen-first delegation above guarantees a
                // screen could still claim it, but by convention none do, so
                // quitting behaves identically on every tab.
                return ShellAction.Exit
            }
            default {
                let _ = 0
            }
        }
        return ShellAction.Continue
    }

    /// Build the `?` help overlay from the global keymap plus the active screen's hints.
    private func BuildHelpOverlay() IModal {
        let globalEntries = List[(Key string, Action string)]{
            ("1-${tabs.Count}", "go to tab"),
            ("tab", "next tab"),
            ("shift+tab", "previous tab"),
            (":", "command palette"),
            ("t", "cycle theme"),
            ("q", "quit"),
            ("ctrl+c", "cancel · quit"),
            ("esc", "back / clear")
        }
        if options.LogBuffer != nil {
            globalEntries.Insert(4, ("l", "logs"))
        }
        let sections = List[HelpOverlay.HelpSection]{HelpOverlay.HelpSection("Global", globalEntries)}
        let screenEntries = List[(Key string, Action string)]()
        for kv in tabs[activeTab].Hints {
            if !string.IsNullOrWhiteSpace(kv.Value) {
                screenEntries.Add((kv.Key, kv.Value!!))
            }
        }
        if screenEntries.Count > 0 {
            sections.Add(HelpOverlay.HelpSection(tabs[activeTab].Title, screenEntries))
        }
        return HelpOverlay(sections)
    }

    /// Build the `:` command palette. Verbs mirror command-mode vocabulary.
    private func BuildCommandPalette() IModal {
        let verbs = List[CommandPalette.PaletteVerb]()
        for tab in tabs {
            verbs.Add(CommandPalette.PaletteVerb(tab.Title.ToLowerInvariant(), "go to ${tab.Title}"))
        }
        if options.LogBuffer != nil {
            verbs.Add(CommandPalette.PaletteVerb("logs", "open the logs overlay"))
        }
        for theme in Theme.Available {
            verbs.Add(CommandPalette.PaletteVerb("theme ${theme.Name.ToLowerInvariant()}", "switch theme"))
        }
        verbs.Add(CommandPalette.PaletteVerb("help", "show the keymap"))
        verbs.Add(CommandPalette.PaletteVerb("quit", "exit the TUI"))
        return CommandPalette(verbs, RunPaletteVerb)
    }

    private func RunPaletteVerb(verb string) {
        let v = verb.Trim()
        for var i = 0; i < tabs.Count; i++ {
            if string.Equals(tabs[i].Title, v, StringComparison.OrdinalIgnoreCase) {
                SwitchTab(i)
                return
            }
        }
        if string.Equals(v, "logs", StringComparison.OrdinalIgnoreCase) {
            if options.LogBuffer != nil {
                logsOpen = true
            }
            return
        }
        if v.StartsWith("theme ", StringComparison.OrdinalIgnoreCase) {
            let name = v["theme ".Length ..].Trim()
            try {
                Theme.Use(name)
                PersistTheme(Theme.Current.Name)
                ShowToast("Theme: ${Theme.Current.Name}")
            } catch (ArgumentException) {
                ShowToast("Unknown theme '$name'.")
            }
            return
        }
        if string.Equals(v, "help", StringComparison.OrdinalIgnoreCase) {
            ShowModal(BuildHelpOverlay())
            return
        }
        if string.Equals(v, "quit", StringComparison.OrdinalIgnoreCase) || string.Equals(
            v,
            "exit",
            StringComparison.OrdinalIgnoreCase
        ) {
            exitRequested = true
            return
        }
        ShowToast("Unknown command: $v")
    }

    /// Persist a runtime theme switch to the CLI config (fire-and-forget) so
    /// the choice survives restarts, mirroring what the Settings screen saves.
    private func PersistTheme(name string) {
        let factory = options.ConfigServiceFactory
        if factory == nil {
            return
        }
        let _ = Task.Run(
            async () -> {
                try {
                    let svc = factory!!()
                    let cfg = await svc.LoadAsync().ConfigureAwait(false)
                    await svc.SaveAsync(cfg with{Theme = name}).ConfigureAwait(false)
                } catch {
                    // Best effort — a failed save must never disturb the UI.

                }
            }
        )
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
        // Chrome is exactly four rows: header, spacer, footer rule, footer.
        // The body fills the rest so the frame always spans the full terminal.
        let bodyHeight = Math.Max(5, height - 4)
        lastBodyHeight = bodyHeight
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
        let paint = Tokens.HasBackdrop
        let canvasColor = Tokens.Canvas.Value
        let cellColor = Tokens.CellBackground.Value
        let canvasFill = if paint {
            Style(background: canvasColor)
        } else {
            Style.Plain
        }
        let cellFill = if paint {
            Style(background: cellColor)
        } else {
            Style.Plain
        }
        // Header: brand pill + tab strip on the canvas.
        let header = Backdrop(Markup(BuildHeader(width)), canvasColor, padLeft: 0, padRight: 0)
        let spacer = Backdrop(Markup(string.Empty), canvasColor, padLeft: 0, padRight: 0)
        // Body: the active screen (or the load spinner) on a raised cell
        // surface, inset one column from each edge so the canvas shows as a
        // margin. The inner FixedHeight pins the surface to the full body
        // height so short content never collapses the frame.
        var bodyInner IRenderable
        if screenLoadPending {
            // Reconcile: if the task has completed, clear pending so this
            // frame renders the actual screen content (not the spinner).
            let lt Task? = screenLoadTask
            if lt != nil && lt.IsCompleted {
                screenLoadPending = false
                screenLoadTask = nil
                bodyInner = screen.Render(width - 4, bodyHeight)
            } else {
                bodyInner = RenderLoadSpinner(screen.Title)
            }
        } else {
            bodyInner = screen.Render(width - 4, bodyHeight)
        }
        let bodySurface = FixedHeight(Backdrop(bodyInner, cellColor, padLeft: 1, padRight: 1), bodyHeight, cellFill)
        let body = Backdrop(bodySurface, canvasColor, padLeft: 1, padRight: 1)
        // Footer: rule + hints left / status right.
        let ruleRow = Backdrop(
            Markup("[${Tokens.BorderNeutral.Value.ToMarkup()}]${String('─', Math.Max(1, width))}[/]"),
            canvasColor,
            padLeft: 0,
            padRight: 0
        )
        let status = BuildStatus()
        let statusWidth = Math.Min(Math.Max(1, width / 2), Math.Max(1, Markup.Remove(status).Length))
        var footerLeft IRenderable
        if toast != nil {
            let c = Tokens.StatusWarning.Value.ToMarkup()
            footerLeft = Markup("[$c]! ${Markup.Escape(toast!!)}[/]")
        } else {
            let bar = BuildHintBar(screen)
            bar.MaxWidth = Math.Max(1, width - statusWidth - 4)
            footerLeft = bar.Render()
        }
        let footerRow = SideBySide(
            Backdrop(footerLeft, canvasColor, padLeft: 1, padRight: 0),
            Math.Max(1, width - statusWidth - 3),
            2,
            Backdrop(Markup(status), canvasColor, padLeft: 0, padRight: 1),
            statusWidth + 1,
            canvasFill
        )
        var frame IRenderable = Rows(header, spacer, body, ruleRow, footerRow)
        // Floating overlays: dialogs, palette, help, and the logs viewer are
        // centered over the frame; the chrome stays visible behind them.
        if activeModal != nil {
            let mw = Math.Clamp(width - 16, 40, 76)
            frame = Overlay(frame, ModalSurface(activeModal!!.Render(mw - 3, bodyHeight - 2)), mw)
        } else if logsOpen && options.LogBuffer is {} buf {
            let lw = Math.Clamp(width - 8, 40, 110)
            frame = Overlay(frame, ModalSurface(RenderLogsOverlay(buf, lw - 3, bodyHeight - 2)), lw)
        }
        target.Write(FixedHeight(frame, height, canvasFill))
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

    private func MakeTabStrip() TabStrip -> TabStrip{
        Titles: tabs.Select((t ITabScreen) -> t.Title).ToArray(),
        ActiveIndex: activeTab,
        UseAscii: options.UseAscii
    }

    /// The single-row header: brand pill + tab strip. The pill spans columns
    /// 1..6 and the strip starts at (cref:HeaderStripStart) — keep in sync
    /// with the click hit-testing in (cref:DispatchMouse).
    private func BuildHeader(width int32) string {
        let brandMarkup = Tokens.Brand.Value.ToMarkup()
        let canvasMarkup = Tokens.Canvas.Value.ToMarkup()
        let pill = if Tokens.HasBackdrop {
            "[$canvasMarkup on $brandMarkup bold] oahu [/]"
        } else {
            "[invert bold] oahu [/]"
        }
        return " $pill  ${MakeTabStrip().RenderMarkup()}"
    }

    /// Footer-right status: signed-in dot, profile, activity verb, version.
    private func BuildStatus() string {
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        var profile string
        var verb string
        var signedIn bool
        if options.State is {} st {
            profile = st.ProfileDisplay
            verb = st.ActivityVerb
            signedIn = st.IsSignedIn
        } else {
            signedIn = !string.IsNullOrEmpty(options.Profile)
            profile = if !signedIn {
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
        let dotColor = if signedIn {
            Tokens.StatusSuccess.Value.ToMarkup()
        } else {
            Tokens.TextTertiary.Value.ToMarkup()
        }
        let version = if string.IsNullOrEmpty(options.Version) {
            string.Empty
        } else {
            " [$tertiary]· v${Markup.Escape(options.Version)}[/]"
        }
        return "[$dotColor]●[/] [$secondary]${Markup.Escape(profile)}[/] [$tertiary]· ${Markup.Escape(verb)}[/]$version"
    }

    /// Footer-left hints: the active screen's own keys plus the two global
    /// discoverability anchors. Everything else lives in the `?` overlay.
    private func BuildHintBar(screen ITabScreen) HintBar {
        let bar = HintBar{UseAscii: options.UseAscii}
        bar.AddRange(screen.Hints)
        bar.Add(":", "commands")
        bar.Add("?", "help")
        return bar
    }

    /// Wraps a modal body in the shared floating-surface treatment: a filled
    /// background with a themed accent bar (or a plain bordered panel when the
    /// theme paints no backgrounds).
    private func ModalSurface(inner IRenderable) IRenderable {
        if Tokens.HasBackdrop && !options.UseAscii {
            return Backdrop(inner, Tokens.InputBackground.Value, accent: Tokens.Brand.Value, padLeft: 1, padRight: 1)
        }
        return Panel(inner){
            Border = if options.UseAscii {
                BoxBorder.Ascii
            } else {
                BoxBorder.Rounded
            },
            BorderStyle = Style(Tokens.BorderNeutral)
        }
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
        for var i = startIndex; i < snapshot.Count; i++ {
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
    /// Uses the themed Knight-Rider scanner when the theme paints backgrounds;
    /// falls back to the colourless pulse glyph in Mono / ASCII mode.
    private func RenderLoadSpinner(screenTitle string) IRenderable {
        let s = Tokens.TextSecondary.Value.ToMarkup()
        let label = "[$s]Loading ${Markup.Escape(screenTitle.ToLowerInvariant())}…[/]"
        if Tokens.HasBackdrop && !options.UseAscii {
            loadFrame++
            let brand = Tokens.Brand.Value
            let scanner = KnightRiderAnimation(
                width: 6,
                style: KnightRiderStyle.Blocks,
                holdStart: 6,
                holdEnd: 3,
                colors: KnightRiderAnimation.DeriveTrailColors(brand),
                defaultColor: KnightRiderAnimation.DeriveInactiveColor(brand, factor: 0.6d),
                minAlpha: 0.3d
            )
            let glyphs = scanner.RenderMarkup(loadFrame, Tokens.CellBackground.Value)
            return Padder(Rows([]IRenderable{Markup("$glyphs  $label")})).Padding(2, 1, 2, 1)
        }
        return Padder(Rows([]IRenderable{Markup("${loadSpinner.RenderMarkup()} $label")})).Padding(2, 1, 2, 1)
    }

    /// Console-backed key reader used by the production path. Also decodes
    /// terminal mouse input: on Unix, SGR reports (`ESC [ < …`) arrive through
    /// `Console.ReadKey` one character at a time and are reassembled here; on
    /// Windows, the native (cref:WindowsConsoleInput) path is used when it
    /// could be set up, surfacing wheel/click records directly.
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

        func ReadEvent() ShellInputEvent? {
            while true {
                if WindowsConsoleInput.IsActive {
                    let ev = WindowsConsoleInput.ReadEvent(-1, out var _)
                    if ev != nil {
                        return ev
                    }
                    // Hard failure — fall through to the portable path once.

                }
                let key = ReadKey()
                if key == nil {
                    return nil
                }
                switch TranslateEscape(key, out var translated) {
                    case EscapeTranslation.NotMouse {
                        return ShellInputEvent.FromKey(key)
                    }
                    case EscapeTranslation.MouseEvent {
                        return translated
                    }
                    case EscapeTranslation.ConsumedIgnored {
                        continue
                    }
                }
            }
        }

        func TryReadEvent(millisecondsTimeout int32, out ev ShellInputEvent) bool {
            if WindowsConsoleInput.IsActive {
                let winEv = WindowsConsoleInput.ReadEvent(millisecondsTimeout, out var timedOut)
                if winEv != nil {
                    ev = winEv
                    return true
                }
                if timedOut {
                    ev = default(ShellInputEvent)
                    return false
                }
                // Hard failure — fall through to the portable path.

            }
            while true {
                if !TryReadKey(millisecondsTimeout, out var key) {
                    ev = default(ShellInputEvent)
                    return false
                }
                switch TranslateEscape(key, out var translated) {
                    case EscapeTranslation.NotMouse {
                        ev = ShellInputEvent.FromKey(key)
                        return true
                    }
                    case EscapeTranslation.MouseEvent {
                        ev = translated
                        return true
                    }
                    case EscapeTranslation.ConsumedIgnored {
                        // A release/drag report — keep reading within budget.
                        continue
                    }
                }
            }
        }

        private enum EscapeTranslation {
            NotMouse,
            MouseEvent,
            ConsumedIgnored
        }

        /// If [`key`](paramref) is the Escape that opens an SGR mouse report,
        /// consume the rest of the report. A bare Escape (no pending input)
        /// passes through untouched, so the key still works as "back/clear".
        private func TranslateEscape(key ConsoleKeyInfo, out ev ShellInputEvent) EscapeTranslation {
            ev = default(ShellInputEvent)
            if key.Key != ConsoleKey.Escape || key.KeyChar != char(27) {
                return EscapeTranslation.NotMouse
            }
            // The report's remaining characters are already buffered when the
            // terminal sent a mouse sequence; a human Esc press arrives alone.
            if !PendingWithin(2) {
                return EscapeTranslation.NotMouse
            }
            let c1 = NextPendingChar(5)
            if c1 != '[' {
                // Unknown escape — swallow silently and report a bare Esc.
                return EscapeTranslation.NotMouse
            }
            let c2 = NextPendingChar(5)
            if c2 != '<' {
                // A CSI we don't understand; degrade to Esc.
                return EscapeTranslation.NotMouse
            }
            var mouse MouseEvent? = nil
            let parsed = SgrMouseParser.TryParse(() -> NextPendingChar(10), out mouse)
            if !parsed || mouse == nil {
                return EscapeTranslation.ConsumedIgnored
            }
            ev = ShellInputEvent.FromMouse(mouse!!)
            return EscapeTranslation.MouseEvent
        }

        private func PendingWithin(timeoutMs int32) bool {
            try {
                let deadline = Environment.TickCount64 + int64(timeoutMs)
                while true {
                    if Console.KeyAvailable {
                        return true
                    }
                    if Environment.TickCount64 >= deadline {
                        return false
                    }
                    Thread.Sleep(1)
                }
            } catch (InvalidOperationException) {
                return false
            }
        }

        private func NextPendingChar(timeoutMs int32) char? {
            if !PendingWithin(timeoutMs) {
                return nil
            }
            try {
                return Console.ReadKey(intercept: true).KeyChar
            } catch (InvalidOperationException) {
                return nil
            }
        }
    }

    shared {
        /// Lines scrolled per mouse-wheel notch.
        private const ScrollLinesPerNotch int32 = 3

        /// Column where the tab strip begins in the header row
        /// (1 leading space + 6-cell brand pill + 2 spaces).
        private const HeaderStripStart int32 = 9

        /// First body row (row 0 = header, row 1 = spacer).
        private const BodyTop int32 = 2

        /// First body column (1 canvas margin + 1 surface padding).
        private const BodyLeft int32 = 2

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
