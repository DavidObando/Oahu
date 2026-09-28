using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Oahu.Cli.App.Auth;
using Oahu.Cli.App.Library;
using Oahu.Cli.App.Models;
using Oahu.Cli.Tui.Auth;
using Oahu.Cli.Tui.Shell;
using Oahu.Cli.Tui.Widgets;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Screens;

/// <summary>
/// Home screen (tab 1). Shows greeting, active profile summary, and quick
/// actions. Per design TUI-exploration §2.
/// </summary>
public sealed class HomeScreen : ITabScreen
{
    private const string SignInActivityMessage = "Signing in to Audible";

    private readonly AppShellState state;
    private readonly Func<IAuthService> authServiceFactory;
    private readonly Func<ILibraryService> libraryServiceFactory;
    private readonly PulseSpinner signInSpinner = new();

    private bool loaded;
    private int libraryCount;
    private string? accountName;
    private bool refreshing;

    private IAppShellNavigator? navigator;
    private RegionPickerModal? pendingRegionModal;
    private CredentialsModal? pendingCredentialsModal;
    private CliRegion pendingRegion;
    private SignInFlow? signInFlow;
    private TuiCallbackBroker? signInBroker;
    private int actionCursor;

    private readonly record struct QuickAction(string Label, string KeyHint, string Id);

    public HomeScreen(AppShellState state, Func<IAuthService> authServiceFactory, Func<ILibraryService> libraryServiceFactory)
    {
        this.state = state ?? throw new ArgumentNullException(nameof(state));
        this.authServiceFactory = authServiceFactory ?? throw new ArgumentNullException(nameof(authServiceFactory));
        this.libraryServiceFactory = libraryServiceFactory ?? throw new ArgumentNullException(nameof(libraryServiceFactory));
    }

    public string Title => "Home";

    public char NumberKey => '1';

    /// <summary>
    /// True while a sign-in is in progress (the shell keeps polling the input
    /// loop so background completion is observed without a key press).
    /// </summary>
    public bool NeedsTimedRefresh => signInFlow is not null || pendingRegionModal is not null || pendingCredentialsModal is not null;

    /// <summary>Event raised when the user picks the "sign in" action.</summary>
    public Action? OnSignInRequested { get; set; }

    public IEnumerable<KeyValuePair<string, string?>> Hints
    {
        get
        {
            yield return new("↑↓", "choose");
            yield return new("enter", "run");
            if (!state.IsSignedIn)
            {
                yield return new("s", "sign in");
            }
            yield return new("r", "refresh");
        }
    }

    private List<QuickAction> QuickActions()
    {
        var actions = new List<QuickAction>();
        if (state.IsSignedIn)
        {
            actions.Add(new("browse the library", "2", "library"));
            actions.Add(new("review the download queue", "3", "queue"));
            actions.Add(new("watch running jobs", "4", "jobs"));
            actions.Add(new("refresh the library from Audible", "r", "refresh"));
            actions.Add(new("open settings", "6", "settings"));
        }
        else
        {
            actions.Add(new("sign in to Audible", "s", "signin"));
            actions.Add(new("open settings", "6", "settings"));
        }
        return actions;
    }

    private void RunAction(string id)
    {
        switch (id)
        {
            case "library": navigator?.SwitchToTab('2'); break;
            case "queue": navigator?.SwitchToTab('3'); break;
            case "jobs": navigator?.SwitchToTab('4'); break;
            case "settings": navigator?.SwitchToTab('6'); break;
            case "refresh": BeginRefresh(); break;
            case "signin": BeginSignIn(); break;
        }
    }

    public Task? OnActivatedAsync(IAppShellNavigator navigator)
    {
        this.navigator = navigator;
        if (!loaded)
        {
            loaded = true;
            return LoadAsync();
        }
        return null;
    }

    public IRenderable Render(int width, int height)
    {
        DriveSignInFlow();

        var lines = new List<IRenderable>();

        var primary = Tokens.Tokens.TextPrimary.Value.ToMarkup();
        var secondary = Tokens.Tokens.TextSecondary.Value.ToMarkup();
        var tertiary = Tokens.Tokens.TextTertiary.Value.ToMarkup();
        var brand = Tokens.Tokens.Brand.Value.ToMarkup();
        var success = Tokens.Tokens.StatusSuccess.Value.ToMarkup();

        var greetName = !string.IsNullOrEmpty(accountName) ? $", {accountName.Split(' ')[0]}" : string.Empty;
        lines.Add(new Markup($"[{brand} bold]Aloha{Markup.Escape(greetName)}.[/]"));
        lines.Add(new Markup($"[{tertiary}]Your Audible library, on the command line.[/]"));
        lines.Add(new Markup(" "));

        if (state.IsSignedIn)
        {
            lines.Add(new Markup($"[{secondary} bold]Account[/]"));
            var who = string.IsNullOrEmpty(accountName) ? state.ProfileDisplay : $"{accountName} · {state.ProfileDisplay}";
            lines.Add(new Markup($"  [{success}]●[/] [{primary}]{Markup.Escape(who)}[/]"));
            lines.Add(new Markup($"  [{tertiary}]{libraryCount} title{(libraryCount == 1 ? "" : "s")} in your library[/]"));
            lines.Add(new Markup(" "));
            lines.Add(new Markup($"[{secondary} bold]Jump in[/]"));
            AppendQuickActions(lines);
            lines.Add(new Markup(" "));
            lines.Add(new Markup($"[{tertiary}]: runs any command · t tries another look[/]"));
        }
        else if (signInFlow is not null)
        {
            // Sign-in in progress (between credentials submit and any 2FA modal,
            // or while waiting on Audible to finish registration). Surface a
            // PulseSpinner + the active verb so the home screen doesn't look
            // dead while the background task is working.
            lines.Add(new Markup($"[{secondary}]{Markup.Escape(SignInActivityMessage)}…[/]"));
            lines.Add(new Markup(" "));
            var verb = string.IsNullOrWhiteSpace(state.ActivityVerb) || string.Equals(state.ActivityVerb, "idle", StringComparison.Ordinal)
                ? "working"
                : state.ActivityVerb;
            lines.Add(new Markup($"{signInSpinner.RenderMarkup()} [{primary}]{Markup.Escape(verb)}[/] [{tertiary}]· Esc to cancel[/]"));
        }
        else
        {
            lines.Add(new Markup($"[{secondary}]You're not signed in yet.[/]"));
            lines.Add(new Markup(" "));
            AppendQuickActions(lines);
            lines.Add(new Markup(" "));
            lines.Add(new Markup($"[{tertiary}]or from a shell: oahu-cli auth login --region us[/]"));
        }

        return new Padder(new Rows(lines)).Padding(2, 1, 2, 1);
    }

    private void AppendQuickActions(List<IRenderable> lines)
    {
        var primary = Tokens.Tokens.TextPrimary.Value.ToMarkup();
        var secondary = Tokens.Tokens.TextSecondary.Value.ToMarkup();
        var tertiary = Tokens.Tokens.TextTertiary.Value.ToMarkup();
        var brand = Tokens.Tokens.Brand.Value.ToMarkup();
        var actions = QuickActions();
        actionCursor = Math.Clamp(actionCursor, 0, Math.Max(0, actions.Count - 1));
        for (var i = 0; i < actions.Count; i++)
        {
            var isCursor = i == actionCursor;
            var pointer = isCursor ? $"[{brand}]❯[/]" : " ";
            var style = isCursor ? $"bold {primary}" : secondary;
            var row = $"  {pointer} [{style}]{Markup.Escape(actions[i].Label)}[/]  " +
                      $"[{tertiary}]{Markup.Escape(actions[i].KeyHint)}[/]";
            lines.Add(isCursor && Tokens.Tokens.HasBackdrop
                ? new Backdrop(new Markup(row), Tokens.Tokens.InputBackground.Value, padLeft: 0, padRight: 1)
                : new Markup(row));
        }
    }

    public bool HandleScroll(int delta)
    {
        actionCursor = Math.Clamp(actionCursor + delta, 0, Math.Max(0, QuickActions().Count - 1));
        return true;
    }

    public bool HandleKey(ConsoleKeyInfo key)
    {
        switch (key.Key)
        {
            case ConsoleKey.Escape when signInFlow is not null:
                signInFlow.Cancel();
                return true;
            case ConsoleKey.UpArrow:
            case ConsoleKey.K:
                actionCursor = Math.Max(0, actionCursor - 1);
                return true;
            case ConsoleKey.DownArrow:
            case ConsoleKey.J:
                actionCursor = Math.Min(QuickActions().Count - 1, actionCursor + 1);
                return true;
            case ConsoleKey.Enter:
                var actions = QuickActions();
                if (actionCursor >= 0 && actionCursor < actions.Count)
                {
                    RunAction(actions[actionCursor].Id);
                }
                return true;
            case ConsoleKey.S when key.Modifiers == 0:
                if (!state.IsSignedIn)
                {
                    BeginSignIn();
                    return true;
                }
                break;
            case ConsoleKey.R when key.Modifiers == 0:
                BeginRefresh();
                return true;
        }
        return false;
    }

    /// <summary>Refresh the summary data from the services (synchronous, for tests).</summary>
    public void Refresh()
    {
        try
        {
            var auth = authServiceFactory();
            var session = auth.GetActiveAsync().GetAwaiter().GetResult();
            if (session is not null)
            {
                accountName = session.AccountName;
            }

            var lib = libraryServiceFactory();
            // Force an Audible pull so a freshly-purchased title shows up
            // in the count (and propagates to the Library screen via the
            // shared LibraryGeneration token).
            lib.RefreshAsync().GetAwaiter().GetResult();
            var items = lib.ListAsync().GetAwaiter().GetResult();
            libraryCount = items.Count;
            loaded = true;
            state.InvalidateLibrary();
        }
        catch
        {
            loaded = true;
            // Swallow — the TUI must not crash.
        }
    }

    /// <summary>
    /// Kick off a refresh on a background thread, tracked by the shell so it
    /// renders a spinner while the Audible pull is in flight. Used by the
    /// 'r' key — keeping this off the render thread avoids freezing the UI
    /// during the network round-trip.
    /// </summary>
    private void BeginRefresh()
    {
        if (refreshing)
        {
            return;
        }

        refreshing = true;
        var task = Task.Run(() =>
        {
            try
            {
                var auth = authServiceFactory();
                var session = auth.GetActiveAsync().GetAwaiter().GetResult();
                if (session is not null)
                {
                    accountName = session.AccountName;
                }

                var lib = libraryServiceFactory();
                lib.RefreshAsync().GetAwaiter().GetResult();
                var items = lib.ListAsync().GetAwaiter().GetResult();
                libraryCount = items.Count;
                loaded = true;
                state.InvalidateLibrary();
            }
            catch
            {
                // Swallow — the TUI must not crash on transient refresh errors.
            }
            finally
            {
                refreshing = false;
            }
        });

        navigator?.TrackLoad(task);
    }

    /// <summary>Load data asynchronously (returned to shell for tracking).</summary>
    private Task LoadAsync()
    {
        return Task.Run(() =>
        {
            try
            {
                var auth = authServiceFactory();
                var session = auth.GetActiveAsync().GetAwaiter().GetResult();
                if (session is not null)
                {
                    accountName = session.AccountName;
                }

                var lib = libraryServiceFactory();
                var items = lib.ListAsync().GetAwaiter().GetResult();
                libraryCount = items.Count;
            }
            catch
            {
                // Swallow — the TUI must not crash.
            }
        });
    }

    private void BeginSignIn()
    {
        // Fire the back-compat callback (tests rely on this). Do this first so
        // even environments without a navigator still observe the request.
        OnSignInRequested?.Invoke();

        // Need a navigator (production path) to drive modals; tests typically
        // don't supply one and just observe the callback.
        if (navigator is null
            || pendingRegionModal is not null
            || pendingCredentialsModal is not null
            || signInFlow is not null)
        {
            return;
        }

        pendingRegionModal = new RegionPickerModal();
        navigator.ShowModal(pendingRegionModal);
    }

    private void DriveSignInFlow()
    {
        if (navigator is null)
        {
            return;
        }

        // Step 1: region picker → either advance to credentials or bail out.
        if (pendingRegionModal is not null)
        {
            // External dismissal (e.g. Ctrl+C cleared the modal without
            // setting IsComplete): treat as cancel so the screen state matches
            // what the user sees, and the next `s` press can start over.
            if (!pendingRegionModal.IsComplete && !ReferenceEquals(navigator.ActiveModal, pendingRegionModal))
            {
                pendingRegionModal = null;
                return;
            }

            if (!pendingRegionModal.IsComplete)
            {
                return;
            }

            var modal = pendingRegionModal;
            pendingRegionModal = null;

            if (modal.WasCancelled || string.IsNullOrEmpty(modal.Result))
            {
                return;
            }

            if (!TryParseRegion(modal.Result, out var region))
            {
                navigator.ShowToast($"Unknown region '{modal.Result}'.");
                return;
            }

            pendingRegion = region;
            pendingCredentialsModal = new CredentialsModal(region.ToString().ToLowerInvariant());
            navigator.ShowModal(pendingCredentialsModal);
            return;
        }

        // Step 2: credentials modal → start the SignInFlow.
        if (pendingCredentialsModal is not null)
        {
            if (!pendingCredentialsModal.IsComplete && !ReferenceEquals(navigator.ActiveModal, pendingCredentialsModal))
            {
                pendingCredentialsModal = null;
                return;
            }

            if (!pendingCredentialsModal.IsComplete)
            {
                return;
            }

            var modal = pendingCredentialsModal;
            pendingCredentialsModal = null;

            if (modal.WasCancelled || modal.Result is null)
            {
                return;
            }

            try
            {
                signInBroker = new TuiCallbackBroker();
                navigator.SetBroker(signInBroker);
                signInFlow = new SignInFlow(
                    authServiceFactory(),
                    libraryServiceFactory(),
                    signInBroker,
                    state);
                signInFlow.Start(pendingRegion, modal.Result);
            }
            catch (Exception ex)
            {
                navigator.ShowToast($"Sign-in failed to start: {ex.Message}");
                TeardownSignInFlow();
            }

            return;
        }

        // Step 3: SignInFlow running — poll for completion / error.
        if (signInFlow is not null)
        {
            var result = signInFlow.Poll();
            if (result is not null)
            {
                // Success: state.Profile / Region are already populated by the
                // background task. Refresh the home summary and tear down.
                accountName = result.Session.AccountName;
                libraryCount = result.LibraryCount;
                loaded = true;
                navigator.ShowToast($"Signed in as {result.Session.ProfileAlias} · {result.LibraryCount} title{(result.LibraryCount == 1 ? string.Empty : "s")}");
                TeardownSignInFlow();
                return;
            }

            if (!signInFlow.IsRunning)
            {
                // Failed or cancelled.
                var msg = signInFlow.ErrorMessage ?? "Sign-in did not complete.";
                navigator.ShowToast(msg);
                TeardownSignInFlow();
            }
        }
    }

    private void TeardownSignInFlow()
    {
        try
        {
            signInFlow?.Dispose();
        }
        catch
        {
            // ignore — we're tearing down.
        }
        signInFlow = null;
        signInBroker = null;
        navigator?.SetBroker(null);
    }

    private static bool TryParseRegion(string code, out CliRegion region)
    {
        return Enum.TryParse(code, ignoreCase: true, out region);
    }
}
