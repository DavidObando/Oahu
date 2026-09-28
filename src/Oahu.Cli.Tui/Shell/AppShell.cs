using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Oahu.Cli.App.Config;
using Oahu.Cli.App.Errors;
using Oahu.Cli.App.Models;
using Oahu.Cli.Tui.Auth;
using Oahu.Cli.Tui.Logging;
using Oahu.Cli.Tui.Screens;
using Oahu.Cli.Tui.Themes;
using Oahu.Cli.Tui.Widgets;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Shell;

/// <summary>
/// The top-level TUI controller, per design §3.4 / §6 / §10 and the TUI-exploration §1.
///
/// Phase 6 deliverable: an empty-but-navigable shell.
/// Phase 7 additions: modal overlays, mutable header state, broker polling.
/// Phase 8 additions: tab-lifecycle hooks (<see cref="ITabScreen.OnActivated"/> /
/// <see cref="ITabScreen.OnDeactivated"/> / <see cref="ITabScreen.OnShutdown"/>),
/// <see cref="IAppShellNavigator"/> implementation for screens that need to
/// switch tabs / open modals / raise toasts, and OSC 9;4 progress emission via
/// <see cref="ITerminalProgressProvider"/>.
///
///   • Header (app name, profile/region, activity verb, version)
///   • Tab strip (Home, Library, Queue, Jobs, History, Settings)
///   • Body (delegated to <see cref="ITabScreen.Render"/>, or a modal overlay)
///   • Pinned hint bar (global + per-screen hints)
///   • Logs overlay (toggled with <c>L</c>)
///   • Progressive Ctrl+C state machine
///   • Alt-screen entry / exit with full restoration on crash
/// </summary>
public sealed class AppShell : IAppShellNavigator
{
    /// <summary>OSC 9;4 clear sequence — removes the terminal title-bar / dock progress indicator.</summary>
    public const string TerminalProgressClearSequence = "\u001b]9;4;0;0\u001b\\";

    /// <summary>
    /// Source of key presses. The production path uses <see cref="ConsoleKeyReader"/>;
    /// tests inject deterministic key streams.
    /// </summary>
    public interface IKeyReader
    {
        /// <summary>Block until a key is available, then return it. Return null to signal EOF (exit).</summary>
        ConsoleKeyInfo? ReadKey();

        /// <summary>
        /// Try to read a key within <paramref name="millisecondsTimeout"/> ms.
        /// Returns false (and key = default) if no key was pressed before the timeout.
        /// Default implementation falls back to blocking <see cref="ReadKey"/>.
        /// </summary>
        bool TryReadKey(int millisecondsTimeout, out ConsoleKeyInfo key)
        {
            // Default: blocking read (for tests / simple readers).
            var result = ReadKey();
            if (result is null)
            {
                key = default;
                return false;
            }
            key = result.Value;
            return true;
        }

        ShellInputEvent? ReadEvent()
        {
            var key = ReadKey();
            return key is null ? null : ShellInputEvent.FromKey(key.Value);
        }

        bool TryReadEvent(int millisecondsTimeout, out ShellInputEvent inputEvent)
        {
            if (TryReadKey(millisecondsTimeout, out var key))
            {
                inputEvent = ShellInputEvent.FromKey(key);
                return true;
            }
            inputEvent = default;
            return false;
        }
    }

    private const int ScrollLinesPerNotch = 3;
    private const int HeaderStripStart = 9;
    private const int BodyTop = 2;
    private const int BodyLeft = 2;

    private readonly IAnsiConsole console;
    private readonly AppShellOptions options;
    private readonly IReadOnlyList<ITabScreen> tabs;
    private readonly CtrlCState ctrlC;
    private readonly PulseSpinner loadSpinner = new();

    private int loadFrame;
    private int activeTab;
    private int lastRenderedTab = -1;
    private bool logsOpen;
    private string? toast;
    private DateTimeOffset? toastShownAt;
    private IModal? activeModal;
    private TuiCallbackBroker? activeBroker;
    private volatile bool needsTimedRefresh;
    private bool exitRequested;
    private int lastBodyHeight = 20;

    // Shell-managed loading: the shell tracks the async load task returned by
    // OnActivatedAsync (or TrackLoad) and renders a spinner while it's pending.
    // screenLoadPending is only cleared inside Render() after the task completes,
    // which guarantees at least one post-load render before blocking on input.
    private System.Threading.Tasks.Task? screenLoadTask;
    private bool screenLoadPending;

    public AppShell(IAnsiConsole console, AppShellOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(console);
        this.console = console;
        this.options = options ?? new AppShellOptions();
        tabs = this.options.Tabs ?? DefaultTabs.Create();
        if (tabs.Count == 0)
        {
            throw new ArgumentException("AppShell requires at least one tab.", nameof(options));
        }
        ctrlC = new CtrlCState();
    }

    public int ActiveTab => activeTab;

    public bool LogsOpen => logsOpen;

    public IReadOnlyList<ITabScreen> Tabs => tabs;

    public IModal? ActiveModal => activeModal;

    /// <summary>Show a modal overlay. Keys route to the modal until it completes.</summary>
    public void ShowModal(IModal modal)
    {
        activeModal = modal ?? throw new ArgumentNullException(nameof(modal));
    }

    /// <summary>Dismiss the active modal.</summary>
    public void DismissModal()
    {
        activeModal = null;
    }

    /// <summary>Set a broker to poll for modal requests from background auth.</summary>
    public void SetBroker(TuiCallbackBroker? broker) => activeBroker = broker;

    /// <inheritdoc />
    public void TrackLoad(System.Threading.Tasks.Task loadTask)
    {
        ArgumentNullException.ThrowIfNull(loadTask);
        screenLoadTask = loadTask;
        screenLoadPending = true;
    }

    /// <summary>True when a shell-managed load task is pending (for test assertions).</summary>
    public bool IsLoadPending => screenLoadPending;

    /// <summary>Switch to a specific tab by index.</summary>
    public void SwitchTab(int index)
    {
        if (index >= 0 && index < tabs.Count && index != activeTab)
        {
            ChangeActiveTab(index);
        }
    }

    /// <summary>Switch to the tab whose <see cref="ITabScreen.NumberKey"/> matches.</summary>
    public void SwitchToTab(char numberKey)
    {
        for (var i = 0; i < tabs.Count; i++)
        {
            if (tabs[i].NumberKey == numberKey)
            {
                SwitchTab(i);
                return;
            }
        }
    }

    /// <summary>Show a transient toast (warning style). Cleared on next key press.</summary>
    public void ShowToast(string message)
    {
        toast = message ?? string.Empty;
        toastShownAt = DateTimeOffset.UtcNow;
    }

#pragma warning disable SA1202 // Helpers grouped near related public methods.
    private static void EmitTerminalSequence(string seq)
    {
        try
        {
            Console.Out.Write(seq);
            Console.Out.Flush();
        }
        catch
        {
            // ignore
        }
    }

    private void ChangeActiveTab(int newIndex)
    {
        var oldIndex = activeTab;
        if (oldIndex >= 0 && oldIndex < tabs.Count)
        {
            try
            {
                tabs[oldIndex].OnDeactivated();
            }
            catch
            {
                // Swallow lifecycle errors — UI must keep running.
            }

            // If the deactivating tab was emitting OSC 9;4 progress, clear it.
            if (tabs[oldIndex] is ITerminalProgressProvider)
            {
                EmitTerminalSequence(TerminalProgressClearSequence);
            }
        }

        activeTab = newIndex;

        // Clear any stale load state from the previous screen.
        screenLoadTask = null;
        screenLoadPending = false;

        try
        {
            var task = tabs[newIndex].OnActivatedAsync(this);
            if (task is not null)
            {
                screenLoadTask = task;
                screenLoadPending = true;
            }
        }
        catch
        {
            // ignored
        }
    }

    /// <summary>
    /// Run the shell against an injected key reader. Returns the process exit code
    /// — <c>0</c> for a clean quit (Shift+Q or cooperative Ctrl+C from an idle
    /// shell). The <c>130</c> (SIGINT) code is reserved for the runtime
    /// force-exit path in <see cref="Oahu.Cli.CliEnvironment"/> when the
    /// cooperative state machine fails to drain in time.
    /// </summary>
    public int Run(IKeyReader keyReader)
    {
        ArgumentNullException.ThrowIfNull(keyReader);
        try
        {
            try
            {
                var task = tabs[activeTab].OnActivatedAsync(this);
                if (task is not null)
                {
                    screenLoadTask = task;
                    screenLoadPending = true;
                }
            }
            catch
            {
                // Lifecycle errors must not break the run loop.
            }

            Render();
            while (true)
            {
                // Poll for broker modal requests before blocking for input.
                PollBroker();

                if (needsTimedRefresh)
                {
                    // When a screen is loading, use a timed read so the render
                    // loop can re-render the spinner (~100ms ticks).
                    if (keyReader.TryReadEvent(100, out var timedEvent))
                    {
                        var timedAction = DispatchEvent(timedEvent);
                        if (exitRequested)
                        {
                            return ExitCodes.Success;
                        }
                        switch (timedAction)
                        {
                            case ShellAction.Exit:
                                return ExitCodes.Success;
                            case ShellAction.ExitSigInt:
                                return ExitCodes.Cancelled;
                        }
                    }
                    Render();
                    continue;
                }

                // When a broker is attached, poll briefly so background-arriving
                // challenges become visible promptly rather than waiting for the
                // next user keystroke. Without a broker, fall back to a fully
                // blocking read so unit tests that drive a fixed key queue exit
                // cleanly when the queue drains.
                if (activeBroker is not null)
                {
                    if (keyReader.TryReadEvent(250, out var idleEvent))
                    {
                        var idleAction = DispatchEvent(idleEvent);
                        if (exitRequested)
                        {
                            return ExitCodes.Success;
                        }
                        switch (idleAction)
                        {
                            case ShellAction.Continue:
                                Render();
                                break;
                            case ShellAction.Exit:
                                return ExitCodes.Success;
                            case ShellAction.ExitSigInt:
                                return ExitCodes.Cancelled;
                        }
                    }
                    else if (activeModal is not null)
                    {
                        // No key arrived — keep the modal's spinner / status
                        // animating instead of freezing the frame between
                        // background callbacks (design doc §16.1: dialog
                        // StatusLine pulses at ~12 FPS while awaiting a
                        // broker callback).
                        Render();
                    }
                    continue;
                }

                var inputEvent = keyReader.ReadEvent();
                if (inputEvent is null)
                {
                    return ExitCodes.Success;
                }
                var action = DispatchEvent(inputEvent.Value);
                if (exitRequested)
                {
                    return ExitCodes.Success;
                }
                switch (action)
                {
                    case ShellAction.Continue:
                        Render();
                        break;
                    case ShellAction.Exit:
                        return ExitCodes.Success;
                    case ShellAction.ExitSigInt:
                        return ExitCodes.Cancelled;
                }
            }
        }
        finally
        {
            // Run lifecycle teardown for every tab (give every screen a chance
            // to cancel observers, dispose handles, clear OSC, etc.).
            for (var i = 0; i < tabs.Count; i++)
            {
                try
                {
                    if (i == activeTab)
                    {
                        tabs[i].OnDeactivated();
                    }
                    tabs[i].OnShutdown();
                }
                catch
                {
                    // Swallow — we're tearing down anyway.
                }
            }

            // Always clear any in-flight terminal progress indicator.
            EmitTerminalSequence(TerminalProgressClearSequence);
        }
    }

    private ShellAction DispatchEvent(ShellInputEvent inputEvent)
    {
        if (inputEvent.Key is { } key)
        {
            return Dispatch(key);
        }
        if (inputEvent.Mouse is { } mouse)
        {
            return DispatchMouse(mouse);
        }
        return ShellAction.Continue;
    }

    public ShellAction DispatchMouse(MouseEvent mouseEvent)
    {
        if (activeModal is not null || logsOpen)
        {
            return ShellAction.Continue;
        }
        switch (mouseEvent.Kind)
        {
            case MouseEventKind.WheelUp:
                tabs[activeTab].HandleScroll(-ScrollLinesPerNotch);
                break;
            case MouseEventKind.WheelDown:
                tabs[activeTab].HandleScroll(ScrollLinesPerNotch);
                break;
            case MouseEventKind.Click:
                if (mouseEvent.Y == 0)
                {
                    if (mouseEvent.X is >= 1 and <= 6)
                    {
                        SwitchTab(0);
                    }
                    else
                    {
                        var index = MakeTabStrip().HitTest(mouseEvent.X - HeaderStripStart);
                        if (index >= 0 && index < tabs.Count)
                        {
                            SwitchTab(index);
                        }
                    }
                }
                else if (mouseEvent.Y >= BodyTop && mouseEvent.Y < BodyTop + lastBodyHeight)
                {
                    tabs[activeTab].HandleClick(
                        Math.Max(0, mouseEvent.X - BodyLeft),
                        mouseEvent.Y - BodyTop);
                }
                break;
        }
        return ShellAction.Continue;
    }

    /// <summary>
    /// Dispatch a single key. Public for tests; production callers use
    /// <see cref="Run(IKeyReader)"/>.
    /// </summary>
    public ShellAction Dispatch(ConsoleKeyInfo key)
    {
        // Toast auto-clears on any key after the window has elapsed.
        if (!ctrlC.ToastActive)
        {
            toast = null;
            toastShownAt = null;
        }

        // Progressive Ctrl+C — handled before delegating to the active screen.
        var isCtrlC = key.Key == ConsoleKey.C && (key.Modifiers & ConsoleModifiers.Control) != 0;
        if (isCtrlC)
        {
            // If a modal is open, first Ctrl+C dismisses it.
            if (activeModal is not null)
            {
                DismissModal();
                ctrlC.Reset();
                return ShellAction.Continue;
            }

            switch (ctrlC.OnPress())
            {
                case CtrlCAction.CancelActiveJob:
                case CtrlCAction.CloseDialog:
                    toast = "Press Ctrl+C again to quit · Esc to stay";
                    toastShownAt = DateTimeOffset.UtcNow;
                    return ShellAction.Continue;
                case CtrlCAction.PromptToExit:
                    toast = "Press Ctrl+C again to quit · Esc to stay";
                    toastShownAt = DateTimeOffset.UtcNow;
                    return ShellAction.Continue;
                case CtrlCAction.Exit:
                    // Cooperative exit from an idle shell (the only path that
                    // sets the exit window is PromptToExit, which fires only
                    // when no job/dialog was active). This is a clean quit —
                    // the process exits 0, not 130. The 130 path is reserved
                    // for CliEnvironment's force-exit fallback when the
                    // cooperative state machine fails to drain in time.
                    return ShellAction.Exit;
            }
        }

        // Modal overlay gets keys first.
        if (activeModal is not null)
        {
            activeModal.HandleKey(key);

            // Auto-dismiss when the modal signals completion (Enter, Esc-cancel,
            // or any other terminal action). Adapters push results via their
            // own TaskCompletionSource before this point; screens that own a
            // modal directly (e.g. HomeScreen with the region picker) keep
            // their own reference and read IsComplete / Result on the next
            // render. Without this auto-dismiss, completed modals would
            // linger on screen and starve the owning screen of render ticks.
            if (activeModal.IsComplete)
            {
                DismissModal();
            }
            else if (key.Key == ConsoleKey.Escape)
            {
                // Fallback: modal chose not to handle Esc — treat it as a
                // shell-level cancel so the user is never stuck in a modal.
                DismissModal();
            }
            return ShellAction.Continue;
        }

        // Logs overlay swallows its own input first.
        if (logsOpen)
        {
            switch (key.Key)
            {
                case ConsoleKey.Escape:
                case ConsoleKey.L when (key.Modifiers & ConsoleModifiers.Control) == 0:
                    logsOpen = false;
                    return ShellAction.Continue;
            }
            return ShellAction.Continue;
        }

        // Esc clears toast / pending exit.
        if (key.Key == ConsoleKey.Escape)
        {
            if (toast is not null)
            {
                toast = null;
                toastShownAt = null;
                ctrlC.Reset();
                return ShellAction.Continue;
            }
        }

        // Delegate to the active screen FIRST — when a screen is capturing
        // input (e.g. search mode, text editing) it returns true and global
        // navigation keys are suppressed. If the screen doesn't consume the
        // key, fall through to the global handlers below.
        if (tabs[activeTab].HandleKey(key))
        {
            return ShellAction.Continue;
        }

        if (key.KeyChar == '?')
        {
            ShowModal(BuildHelpOverlay());
            return ShellAction.Continue;
        }
        if (key.KeyChar == ':')
        {
            ShowModal(BuildCommandPalette());
            return ShellAction.Continue;
        }

        // Number keys 1..9 jump to that tab.
        if (key.KeyChar >= '1' && key.KeyChar <= '9')
        {
            var idx = key.KeyChar - '1';
            if (idx < tabs.Count)
            {
                if (idx != activeTab)
                {
                    ChangeActiveTab(idx);
                }
                return ShellAction.Continue;
            }
        }

        switch (key.Key)
        {
            case ConsoleKey.Tab when (key.Modifiers & ConsoleModifiers.Shift) != 0:
                ChangeActiveTab((activeTab - 1 + tabs.Count) % tabs.Count);
                return ShellAction.Continue;
            case ConsoleKey.Tab:
                ChangeActiveTab((activeTab + 1) % tabs.Count);
                return ShellAction.Continue;
            case ConsoleKey.L when (key.Modifiers & ConsoleModifiers.Control) != 0:
                // Ctrl+L: clear / redraw artifacts.
                AltScreen.Clear();
                return ShellAction.Continue;
            case ConsoleKey.L:
                if (options.LogBuffer is not null)
                {
                    logsOpen = true;
                }
                return ShellAction.Continue;
            case ConsoleKey.T when key.Modifiers == 0:
                Theme.Cycle();
                PersistTheme(Theme.Current.Name);
                toast = $"Theme: {Theme.Current.Name}";
                toastShownAt = DateTimeOffset.UtcNow;
                return ShellAction.Continue;
            case ConsoleKey.Q when (key.Modifiers & (ConsoleModifiers.Control | ConsoleModifiers.Alt)) == 0:
                return ShellAction.Exit;
        }

        return ShellAction.Continue;
    }

    private IModal BuildHelpOverlay()
    {
        var globalEntries = new List<(string Key, string Action)>
        {
            ($"1-{tabs.Count}", "go to tab"),
            ("tab", "next tab"),
            ("shift+tab", "previous tab"),
            (":", "command palette"),
            ("t", "cycle theme"),
            ("q", "quit"),
            ("ctrl+c", "cancel · quit"),
            ("esc", "back / clear"),
        };
        if (options.LogBuffer is not null)
        {
            globalEntries.Insert(4, ("l", "logs"));
        }
        var sections = new List<HelpOverlay.HelpSection>
        {
            new("Global", globalEntries),
        };
        var screenEntries = new List<(string Key, string Action)>();
        foreach (var hint in tabs[activeTab].Hints)
        {
            if (!string.IsNullOrWhiteSpace(hint.Value))
            {
                screenEntries.Add((hint.Key, hint.Value));
            }
        }
        if (screenEntries.Count > 0)
        {
            sections.Add(new(tabs[activeTab].Title, screenEntries));
        }
        return new HelpOverlay(sections);
    }

    private IModal BuildCommandPalette()
    {
        var verbs = new List<CommandPalette.PaletteVerb>();
        foreach (var tab in tabs)
        {
            verbs.Add(new(tab.Title.ToLowerInvariant(), $"go to {tab.Title}"));
        }
        if (options.LogBuffer is not null)
        {
            verbs.Add(new("logs", "open the logs overlay"));
        }
        foreach (var theme in Theme.Available)
        {
            verbs.Add(new($"theme {theme.Name.ToLowerInvariant()}", "switch theme"));
        }
        verbs.Add(new("help", "show the keymap"));
        verbs.Add(new("quit", "exit the TUI"));
        return new CommandPalette(verbs, RunPaletteVerb);
    }

    private void RunPaletteVerb(string verb)
    {
        var value = verb.Trim();
        for (var i = 0; i < tabs.Count; i++)
        {
            if (string.Equals(tabs[i].Title, value, StringComparison.OrdinalIgnoreCase))
            {
                SwitchTab(i);
                return;
            }
        }
        if (string.Equals(value, "logs", StringComparison.OrdinalIgnoreCase))
        {
            if (options.LogBuffer is not null)
            {
                logsOpen = true;
            }
            return;
        }
        if (value.StartsWith("theme ", StringComparison.OrdinalIgnoreCase))
        {
            var name = value["theme ".Length..].Trim();
            try
            {
                Theme.Use(name);
                PersistTheme(Theme.Current.Name);
                ShowToast($"Theme: {Theme.Current.Name}");
            }
            catch (ArgumentException)
            {
                ShowToast($"Unknown theme '{name}'.");
            }
            return;
        }
        if (string.Equals(value, "help", StringComparison.OrdinalIgnoreCase))
        {
            ShowModal(BuildHelpOverlay());
            return;
        }
        if (string.Equals(value, "quit", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "exit", StringComparison.OrdinalIgnoreCase))
        {
            exitRequested = true;
            return;
        }
        ShowToast($"Unknown command: {value}");
    }

    private void PersistTheme(string name)
    {
        var factory = options.ConfigServiceFactory;
        if (factory is null)
        {
            return;
        }
        _ = Task.Run(async () =>
        {
            try
            {
                var service = factory();
                var config = await service.LoadAsync().ConfigureAwait(false);
                await service.SaveAsync(config with { Theme = name }).ConfigureAwait(false);
            }
            catch
            {
                // Best effort.
            }
        });
    }

    private void PollBroker()
    {
        if (activeBroker is null)
        {
            return;
        }

        // Auto-dismiss a modal that completed via background means (e.g. broker
        // resolved externally or its task was cancelled): the AppShell otherwise
        // would freeze input forever waiting on a modal it can't dismiss.
        if (activeModal is not null && activeModal.IsComplete)
        {
            activeModal = null;
        }

        if (activeModal is not null)
        {
            return;
        }
        if (activeBroker.TryDequeue(out var request) && request is not null)
        {
            var modal = ModalFactory.CreateFromChallenge(request);
            if (modal is not null)
            {
                ShowModal(modal);
            }
            else
            {
                // Unknown challenge type — fail the awaiter rather than letting
                // the background auth flow hang forever.
                request.Completion.TrySetException(
                    new NotSupportedException(
                        $"AppShell has no modal for challenge type '{request.Challenge?.GetType().Name ?? "<null>"}'."));
            }
        }
    }

    private void Render()
    {
        var screen = tabs[activeTab];
        var width = console.Profile.Width;
        var height = Math.Max(10, console.Profile.Height);
        var bodyHeight = Math.Max(5, height - 4);
        lastBodyHeight = bodyHeight;
        lastRenderedTab = activeTab;

        // Choose rendering target. In a real terminal, render to a string
        // buffer so we can inject \e[K (erase-to-end-of-line) before every
        // newline and write the whole frame atomically — no flicker and no
        // residual characters from longer previous lines.
        // In tests (stdout redirected), render through the injected console
        // so that test assertions on console.Output keep working.
        var useBuffer = !Console.IsOutputRedirected;
        StringWriter? sw = null;
        IAnsiConsole target;

        if (useBuffer)
        {
            sw = new StringWriter();
            sw.NewLine = "\n"; // Force LF — the post-process step injects \e[K before each \n.
            target = AnsiConsole.Create(new AnsiConsoleSettings
            {
                Ansi = AnsiSupport.Yes,
                ColorSystem = ColorSystemSupport.TrueColor,
                Out = new AnsiConsoleOutput(sw),
                Interactive = InteractionSupport.No,
            });
            target.Profile.Width = width;
        }
        else
        {
            target = console;
        }

        var paint = Tokens.Tokens.HasBackdrop;
        var canvasColor = Tokens.Tokens.Canvas.Value;
        var cellColor = Tokens.Tokens.CellBackground.Value;
        var canvasFill = paint ? new Style(background: canvasColor) : Style.Plain;
        var cellFill = paint ? new Style(background: cellColor) : Style.Plain;
        var header = new Backdrop(new Markup(BuildHeader(width)), canvasColor, padLeft: 0, padRight: 0);
        var spacer = new Backdrop(new Markup(string.Empty), canvasColor, padLeft: 0, padRight: 0);

        IRenderable bodyInner;
        if (screenLoadPending)
        {
            // Reconcile: if the task has completed, clear pending so this
            // frame renders the actual screen content (not the spinner).
            var lt = screenLoadTask;
            if (lt is not null && lt.IsCompleted)
            {
                screenLoadPending = false;
                screenLoadTask = null;
                bodyInner = screen.Render(width - 4, bodyHeight);
            }
            else
            {
                bodyInner = RenderLoadSpinner(screen.Title);
            }
        }
        else
        {
            bodyInner = screen.Render(width - 4, bodyHeight);
        }
        var bodySurface = new FixedHeight(
            new Backdrop(bodyInner, cellColor, padLeft: 1, padRight: 1),
            bodyHeight,
            cellFill);
        var body = new Backdrop(bodySurface, canvasColor, padLeft: 1, padRight: 1);
        var ruleRow = new Backdrop(
            new Markup($"[{Tokens.Tokens.BorderNeutral.Value.ToMarkup()}]{new string('─', Math.Max(1, width))}[/]"),
            canvasColor,
            padLeft: 0,
            padRight: 0);
        var status = BuildStatus();
        var statusWidth = Math.Min(Math.Max(1, width / 2), Math.Max(1, Markup.Remove(status).Length));
        IRenderable footerLeft;
        if (toast is not null)
        {
            var c = Tokens.Tokens.StatusWarning.Value.ToMarkup();
            footerLeft = new Markup($"[{c}]! {Markup.Escape(toast)}[/]");
        }
        else
        {
            var bar = BuildHintBar(screen);
            bar.MaxWidth = Math.Max(1, width - statusWidth - 4);
            footerLeft = bar.Render();
        }
        var footerRow = new SideBySide(
            new Backdrop(footerLeft, canvasColor, padLeft: 1, padRight: 0),
            Math.Max(1, width - statusWidth - 3),
            2,
            new Backdrop(new Markup(status), canvasColor, padLeft: 0, padRight: 1),
            statusWidth + 1,
            canvasFill);
        IRenderable frame = new Rows(header, spacer, body, ruleRow, footerRow);
        if (activeModal is not null)
        {
            var modalWidth = Math.Clamp(width - 16, 40, 76);
            frame = new Overlay(frame, ModalSurface(activeModal.Render(modalWidth - 3, bodyHeight - 2)), modalWidth);
        }
        else if (logsOpen && options.LogBuffer is { } buffer)
        {
            var logsWidth = Math.Clamp(width - 8, 40, 110);
            frame = new Overlay(frame, ModalSurface(RenderLogsOverlay(buffer, logsWidth - 3, bodyHeight - 2)), logsWidth);
        }
        target.Write(new FixedHeight(frame, height, canvasFill));

        // OSC 9;4 progress sequence (terminal title-bar / dock indicator).
        // Active screen may opt-in by implementing ITerminalProgressProvider.
        var oscSequence = (screen as ITerminalProgressProvider)?.GetTerminalProgressSequence();

        if (useBuffer && sw is not null)
        {
            // Inject \e[K before every \n so each line clears trailing chars,
            // then write \e[H (home) + frame + \e[K\e[J (erase rest) atomically.
            // OSC 9;4 (if any) appended last so it doesn't interfere with the
            // visible frame.
            //
            // The whole payload is wrapped in DEC mode 2026 (synchronized update)
            // so the terminal buffers all output and paints the complete frame in
            // one pass, eliminating partial-frame flicker. Terminals that don't
            // understand mode 2026 silently ignore it.
            var renderedFrame = AltScreen.InjectEraseBeforeNewlines(sw.ToString());
            Console.Out.Write(
                $"{AltScreen.SyncStartSequence}\u001b[H{renderedFrame}\u001b[K\u001b[J{oscSequence}{AltScreen.SyncEndSequence}");
            Console.Out.Flush();
        }
        else if (!string.IsNullOrEmpty(oscSequence))
        {
            // Tests / redirected stdout: still let progress assertions see it.
            Console.Out.Write(oscSequence);
            Console.Out.Flush();
        }

        // Shell-managed load tasks drive timed refresh independently of
        // the screen's own NeedsTimedRefresh (which covers screen-specific
        // continuous refresh like JobsScreen's observer or mutation spinners).
        needsTimedRefresh = screenLoadPending || screen.NeedsTimedRefresh || (activeBroker?.HasPending ?? false);
    }

    private TabStrip MakeTabStrip() => new()
    {
        Titles = tabs.Select(tab => tab.Title).ToArray(),
        ActiveIndex = activeTab,
        UseAscii = options.UseAscii,
    };

    private string BuildHeader(int width)
    {
        var brand = Tokens.Tokens.Brand.Value.ToMarkup();
        var canvas = Tokens.Tokens.Canvas.Value.ToMarkup();
        var pill = Tokens.Tokens.HasBackdrop
            ? $"[{canvas} on {brand} bold] oahu [/]"
            : "[invert bold] oahu [/]";
        return $" {pill}  {MakeTabStrip().RenderMarkup()}";
    }

    private string BuildStatus()
    {
        var secondary = Tokens.Tokens.TextSecondary.Value.ToMarkup();
        var tertiary = Tokens.Tokens.TextTertiary.Value.ToMarkup();

        string profile;
        string verb;
        bool signedIn;

        if (options.State is { } st)
        {
            profile = st.ProfileDisplay;
            verb = st.ActivityVerb;
            signedIn = st.IsSignedIn;
        }
        else
        {
            signedIn = !string.IsNullOrEmpty(options.Profile);
            profile = !signedIn
                ? "(not signed in)"
                : !string.IsNullOrEmpty(options.Region)
                    ? $"{options.Profile}@{options.Region}"
                    : options.Profile;
            verb = options.ActivityVerb?.Invoke() ?? "idle";
        }

        if (string.IsNullOrEmpty(verb))
        {
            verb = "idle";
        }
        var dotColor = (signedIn ? Tokens.Tokens.StatusSuccess : Tokens.Tokens.TextTertiary).Value.ToMarkup();
        var version = string.IsNullOrEmpty(options.Version)
            ? string.Empty
            : $" [{tertiary}]· v{Markup.Escape(options.Version)}[/]";
        return $"[{dotColor}]●[/] [{secondary}]{Markup.Escape(profile)}[/] " +
               $"[{tertiary}]· {Markup.Escape(verb)}[/]{version}";
    }

    private HintBar BuildHintBar(ITabScreen screen)
    {
        var bar = new HintBar { UseAscii = options.UseAscii };
        bar.AddRange(screen.Hints);
        bar.Add(":", "commands");
        bar.Add("?", "help");
        return bar;
    }

    private IRenderable ModalSurface(IRenderable inner)
    {
        if (Tokens.Tokens.HasBackdrop && !options.UseAscii)
        {
            return new Backdrop(
                inner,
                Tokens.Tokens.InputBackground.Value,
                accent: Tokens.Tokens.Brand.Value,
                padLeft: 1,
                padRight: 1);
        }
        return new Panel(inner)
        {
            Border = options.UseAscii ? BoxBorder.Ascii : BoxBorder.Rounded,
            BorderStyle = new Style(Tokens.Tokens.BorderNeutral),
        };
    }

    private IRenderable RenderLogsOverlay(LogRingBuffer buf, int width, int height)
    {
        var snapshot = buf.Snapshot();
        var lines = new List<IRenderable>(Math.Min(snapshot.Count, height) + 2);
        lines.Add(new Markup($"[{Tokens.Tokens.TextPrimary.Value.ToMarkup()} bold]Logs[/]  [{Tokens.Tokens.TextTertiary.Value.ToMarkup()}]({snapshot.Count}/{buf.Capacity})[/]"));
        lines.Add(new Markup(string.Empty));

        var startIndex = Math.Max(0, snapshot.Count - (height - 4));
        for (var i = startIndex; i < snapshot.Count; i++)
        {
            var entry = snapshot[i];
            var color = entry.Level switch
            {
                Microsoft.Extensions.Logging.LogLevel.Warning => Tokens.Tokens.StatusWarning,
                Microsoft.Extensions.Logging.LogLevel.Error => Tokens.Tokens.StatusError,
                Microsoft.Extensions.Logging.LogLevel.Critical => Tokens.Tokens.StatusError,
                Microsoft.Extensions.Logging.LogLevel.Debug => Tokens.Tokens.TextTertiary,
                Microsoft.Extensions.Logging.LogLevel.Trace => Tokens.Tokens.TextTertiary,
                _ => Tokens.Tokens.TextSecondary,
            };
            lines.Add(new Markup($"[{color.Value.ToMarkup()}]{Markup.Escape(entry.FormatLine())}[/]"));
        }

        return new Padder(new Rows(lines)).Padding(2, 1, 2, 1);
    }

    private IRenderable RenderLoadSpinner(string screenTitle)
    {
        var s = Tokens.Tokens.TextSecondary.Value.ToMarkup();
        var label = $"[{s}]Loading {Markup.Escape(screenTitle.ToLowerInvariant())}…[/]";
        if (Tokens.Tokens.HasBackdrop && !options.UseAscii)
        {
            loadFrame++;
            var brand = Tokens.Tokens.Brand.Value;
            var scanner = new KnightRiderAnimation(
                width: 6,
                style: KnightRiderStyle.Blocks,
                holdStart: 6,
                holdEnd: 3,
                colors: KnightRiderAnimation.DeriveTrailColors(brand),
                defaultColor: KnightRiderAnimation.DeriveInactiveColor(brand, factor: 0.6));
            var glyphs = scanner.RenderMarkup(loadFrame, Tokens.Tokens.CellBackground.Value);
            return new Padder(new Rows(new IRenderable[] { new Markup($"{glyphs}  {label}") }))
                .Padding(2, 1, 2, 1);
        }
        return new Padder(new Rows(new IRenderable[]
        {
            new Markup($"{loadSpinner.RenderMarkup()} {label}"),
        })).Padding(2, 1, 2, 1);
    }

    /// <summary>Console-backed key reader used by the production path.</summary>
    public sealed class ConsoleKeyReader : IKeyReader
    {
        public ConsoleKeyInfo? ReadKey()
        {
            try
            {
                return Console.ReadKey(intercept: true);
            }
            catch (InvalidOperationException)
            {
                // Stdin redirected mid-flight — treat as EOF.
                return null;
            }
        }

        public bool TryReadKey(int millisecondsTimeout, out ConsoleKeyInfo key)
        {
            try
            {
                var deadline = Environment.TickCount64 + millisecondsTimeout;
                while (Environment.TickCount64 < deadline)
                {
                    if (Console.KeyAvailable)
                    {
                        key = Console.ReadKey(intercept: true);
                        return true;
                    }
                    System.Threading.Thread.Sleep(10);
                }
                key = default;
                return false;
            }
            catch (InvalidOperationException)
            {
                key = default;
                return false;
            }
        }

        public ShellInputEvent? ReadEvent()
        {
            while (true)
            {
                if (WindowsConsoleInput.IsActive)
                {
                    var windowsEvent = WindowsConsoleInput.ReadEvent(-1, out _);
                    if (windowsEvent is not null)
                    {
                        return windowsEvent;
                    }
                }
                var key = ReadKey();
                if (key is null)
                {
                    return null;
                }
                switch (TranslateEscape(key.Value, out var translated))
                {
                    case EscapeTranslation.NotMouse:
                        return ShellInputEvent.FromKey(key.Value);
                    case EscapeTranslation.MouseEvent:
                        return translated;
                    case EscapeTranslation.ConsumedIgnored:
                        continue;
                }
            }
        }

        public bool TryReadEvent(int millisecondsTimeout, out ShellInputEvent inputEvent)
        {
            if (WindowsConsoleInput.IsActive)
            {
                var windowsEvent = WindowsConsoleInput.ReadEvent(millisecondsTimeout, out var timedOut);
                if (windowsEvent is not null)
                {
                    inputEvent = windowsEvent.Value;
                    return true;
                }
                if (timedOut)
                {
                    inputEvent = default;
                    return false;
                }
            }
            while (true)
            {
                if (!TryReadKey(millisecondsTimeout, out var key))
                {
                    inputEvent = default;
                    return false;
                }
                switch (TranslateEscape(key, out var translated))
                {
                    case EscapeTranslation.NotMouse:
                        inputEvent = ShellInputEvent.FromKey(key);
                        return true;
                    case EscapeTranslation.MouseEvent:
                        inputEvent = translated;
                        return true;
                    case EscapeTranslation.ConsumedIgnored:
                        continue;
                }
            }
        }

        private enum EscapeTranslation
        {
            NotMouse,
            MouseEvent,
            ConsumedIgnored,
        }

        private static EscapeTranslation TranslateEscape(
            ConsoleKeyInfo key,
            out ShellInputEvent inputEvent)
        {
            inputEvent = default;
            if (key.Key != ConsoleKey.Escape || key.KeyChar != (char)27)
            {
                return EscapeTranslation.NotMouse;
            }
            if (!PendingWithin(2))
            {
                return EscapeTranslation.NotMouse;
            }
            if (NextPendingChar(5) != '[')
            {
                return EscapeTranslation.NotMouse;
            }
            if (NextPendingChar(5) != '<')
            {
                return EscapeTranslation.NotMouse;
            }
            if (!SgrMouseParser.TryParse(() => NextPendingChar(10), out var mouse) || mouse is null)
            {
                return EscapeTranslation.ConsumedIgnored;
            }
            inputEvent = ShellInputEvent.FromMouse(mouse.Value);
            return EscapeTranslation.MouseEvent;
        }

        private static bool PendingWithin(int timeoutMs)
        {
            try
            {
                var deadline = Environment.TickCount64 + timeoutMs;
                while (true)
                {
                    if (Console.KeyAvailable)
                    {
                        return true;
                    }
                    if (Environment.TickCount64 >= deadline)
                    {
                        return false;
                    }
                    Thread.Sleep(1);
                }
            }
            catch (InvalidOperationException)
            {
                return false;
            }
        }

        private static char? NextPendingChar(int timeoutMs)
        {
            if (!PendingWithin(timeoutMs))
            {
                return null;
            }
            try
            {
                return Console.ReadKey(intercept: true).KeyChar;
            }
            catch (InvalidOperationException)
            {
                return null;
            }
        }
    }
}

/// <summary>Possible outcomes of a single key dispatch.</summary>
public enum ShellAction
{
    /// <summary>Continue the input loop, redraw on next tick.</summary>
    Continue,

    /// <summary>Clean exit, return code 0.</summary>
    Exit,

    /// <summary>
    /// SIGINT-style exit, return code 130. Currently unused by the cooperative
    /// state machine (Ctrl+C from an idle shell maps to <see cref="Exit"/>);
    /// reserved for future flows that genuinely abort in-flight work via
    /// Ctrl+C and want POSIX 130 semantics.
    /// </summary>
    ExitSigInt,
}

/// <summary>Creates modal overlays from broker challenge requests.</summary>
internal static class ModalFactory
{
    public static IModal? CreateFromChallenge(ModalRequest request)
    {
        return request.Challenge switch
        {
            App.Auth.ExternalLoginChallenge ext => new ExternalLoginModalAdapter(ext.LoginUri, request),
            App.Auth.MfaChallenge => new ChallengeModalAdapter(
                new ChallengeModal { Title = "MFA Required", Instructions = "Enter the code sent to your device:" },
                request),
            App.Auth.CvfChallenge => new ChallengeModalAdapter(
                new ChallengeModal { Title = "Verification Required", Instructions = "Enter the verification code:" },
                request),
            App.Auth.CaptchaChallenge => new ChallengeModalAdapter(
                new ChallengeModal { Title = "CAPTCHA Required", Instructions = "Enter the text shown in the CAPTCHA:" },
                request),
            App.Auth.ApprovalChallenge => new ChallengeModalAdapter(
                new ChallengeModal { Title = "Approval Required", Instructions = "Approve the sign-in on your trusted device, then press Enter.", ApprovalOnly = true },
                request),
            _ => null,
        };
    }

    /// <summary>Wraps ExternalLoginModal and sets the completion source when done.</summary>
    private sealed class ExternalLoginModalAdapter : IModal
    {
        private readonly ExternalLoginModal inner;
        private readonly ModalRequest request;

        public ExternalLoginModalAdapter(Uri loginUri, ModalRequest request)
        {
            inner = new ExternalLoginModal(loginUri);
            this.request = request;
        }

        public bool IsComplete => inner.IsComplete;

        public bool WasCancelled => inner.WasCancelled;

        public IRenderable Render(int width, int height) => inner.Render(width, height);

        public bool HandleKey(ConsoleKeyInfo key)
        {
            var result = inner.HandleKey(key);
            if (inner.IsComplete)
            {
                if (inner.WasCancelled)
                {
                    request.Completion.TrySetCanceled();
                }
                else if (inner.Result is not null)
                {
                    request.Completion.TrySetResult(inner.Result.ToString());
                }
            }
            return result;
        }
    }

    /// <summary>Wraps ChallengeModal and sets the completion source when done.</summary>
    private sealed class ChallengeModalAdapter : IModal
    {
        private readonly ChallengeModal inner;
        private readonly ModalRequest request;

        public ChallengeModalAdapter(ChallengeModal inner, ModalRequest request)
        {
            this.inner = inner;
            this.request = request;
        }

        public bool IsComplete => inner.IsComplete;

        public bool WasCancelled => inner.WasCancelled;

        public IRenderable Render(int width, int height) => inner.Render(width, height);

        public bool HandleKey(ConsoleKeyInfo key)
        {
            var result = inner.HandleKey(key);
            if (inner.IsComplete)
            {
                if (inner.WasCancelled)
                {
                    request.Completion.TrySetCanceled();
                }
                else if (inner.Result is not null)
                {
                    request.Completion.TrySetResult(inner.Result);
                }
            }
            return result;
        }
    }
}
