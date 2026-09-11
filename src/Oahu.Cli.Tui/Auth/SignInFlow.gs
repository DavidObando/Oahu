package Oahu.Cli.Tui.Auth

import Oahu.Cli.App.Auth
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Shell
import System
import System.Threading
import System.Threading.Tasks

/// Result of a completed sign-in flow.
data class SignInResult {
    prop Session AuthSession {
        get;
        init;
    }

    prop LibraryCount int32 {
        get;
        init;
    }
}

/// Orchestrates sign-in: region picker → LoginAsync (which triggers
/// external-login and optional challenge modals via the broker) → sync library.
/// Runs the auth call on a background task; the broker posts modal requests
/// that the AppShell picks up in its input loop.
class SignInFlow : IDisposable {
    private let authService IAuthService
    private let libraryService ILibraryService
    private let broker TuiCallbackBroker
    private let state AppShellState
    private var cts CancellationTokenSource?
    private var authTask Task[SignInResult]?

    init(authService IAuthService, libraryService ILibraryService, broker TuiCallbackBroker, state AppShellState) {
        this.authService = authService ?? throw ArgumentNullException("authService")
        this.libraryService = libraryService ?? throw ArgumentNullException("libraryService")
        this.broker = broker ?? throw ArgumentNullException("broker")
        this.state = state ?? throw ArgumentNullException("state")
    }

    /// True while the background auth task is running.
    prop IsRunning bool -> authTask != nil && !authTask!!.IsCompleted

    /// Error message if auth failed.
    prop ErrorMessage string? {
        get;
        private set;
    }

    /// The broker that the AppShell polls for modal requests.
    prop Broker TuiCallbackBroker -> broker

    /// Start the login process for the given region on a background thread.
    func Start(region CliRegion, credentials AuthCredentials) {
        ArgumentNullException.ThrowIfNull(credentials)
        StartCore(region, credentials)
    }

    /// Browser-based start (legacy / fallback). Prefer the credentials overload —
    /// the TUI default flow asks the user for username + password and routes
    /// 2FA / CAPTCHA via (cref:ChallengeModal).
    func StartBrowser(region CliRegion) -> StartCore(region, credentials: nil)

    /// Poll the auth task status. Returns a result when complete, null while
    /// still running. Captures exceptions into (cref:ErrorMessage).
    func Poll() SignInResult? {
        if authTask == nil {
            return nil
        }
        if !authTask!!.IsCompleted {
            return nil
        }
        if authTask!!.IsFaulted {
            let ex = authTask!!.Exception?.InnerException ?? authTask!!.Exception
            ErrorMessage = ex?.Message ?? "Sign-in failed."
            this.state.ActivityVerb = "idle"
            authTask = nil
            return nil
        }
        if authTask!!.IsCanceled {
            ErrorMessage = "Sign-in cancelled."
            this.state.ActivityVerb = "idle"
            authTask = nil
            return nil
        }
        let result = authTask!!.Result
        authTask = nil
        return result
    }

    /// Cancel the in-progress auth flow.
    func Cancel() {
        cts?.Cancel()
        this.state.ActivityVerb = "idle"
    }

    /// Disposes the linked CancellationTokenSource. Safe to call multiple times.
    func Dispose() {
        let local = cts
        cts = nil
        try {
            local?.Cancel()
        } catch {
            // already disposed — safe to ignore

        }
        local?.Dispose()
    }

    private func StartCore(region CliRegion, credentials AuthCredentials?) {
        cts = CancellationTokenSource()
        ErrorMessage = nil
        this.state.ActivityVerb = "signing in…"
        authTask = Task.Run[SignInResult](
            async () -> {
                let session = if credentials != nil {
                    await authService.LoginWithCredentialsAsync(
                        region,
                        broker,
                        credentials,
                        preAmazonUsername: false,
                        cts!!.Token
                    )
                        .ConfigureAwait(false)
                } else {
                    await authService.LoginAsync(region, broker, preAmazonUsername: false, cts!!.Token).ConfigureAwait(
                        false
                    )
                }
                this.state.Profile = session.ProfileAlias
                this.state.Region = session.Region.ToString().ToLowerInvariant()
                this.state.ActivityVerb = "syncing library…"
                let count = await libraryService.SyncAsync(session.ProfileAlias, cts!!.Token).ConfigureAwait(false)
                this.state.ActivityVerb = "idle"
                return SignInResult{Session: session, LibraryCount: count}
            }
        )
    }
}
