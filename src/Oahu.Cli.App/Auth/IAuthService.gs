package Oahu.Cli.App.Auth

import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// Credentials supplied by the user for in-process (programmatic) sign-in.
data class AuthCredentials(Username string, Password string) { }

/// Audible authentication boundary. Phase 3 ships this interface plus an in-memory
/// (cref:FakeAuthService). The Core-backed implementation that wraps
/// `Oahu.Core.AudibleLogin` + `Authorize` + the `IAuthCallbackBroker`
/// lands in Phase 4 alongside the `auth login/status/logout` commands, when
/// the exact field set the commands need is settled.
interface IAuthService {
    /// List every signed-in profile. Empty when no one is signed in yet.
    func ListSessionsAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[
        IReadOnlyList[AuthSession]
    ];

    func GetActiveAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[AuthSession?];

    /// Browser-based sign-in: builds an Audible OAuth URL, asks the broker for
    /// the redirect URL the user pasted back, and registers the device.
    func LoginAsync(
        region CliRegion,
        broker IAuthCallbackBroker,
        preAmazonUsername bool = false,
        cancellationToken CancellationToken = default(CancellationToken)
    ) Task[AuthSession];

    /// Programmatic (in-process) sign-in with [`credentials`](paramref).
    /// CAPTCHA, MFA, CVF, and approval challenges are routed through the broker.
    /// Mirrors the GUI's "direct login" path (see Avalonia ProfileWizardViewModel).
    func LoginWithCredentialsAsync(
        region CliRegion,
        broker IAuthCallbackBroker,
        credentials AuthCredentials,
        preAmazonUsername bool = false,
        cancellationToken CancellationToken = default(CancellationToken)
    ) Task[AuthSession] {
        throw NotSupportedException("${GetType().Name} does not support credentials-based sign-in.")
    }

    func LogoutAsync(profileAlias string, cancellationToken CancellationToken = default(CancellationToken)) Task;

    /// Refreshes the access token for [`profileAlias`](paramref); returns the updated session.
    func RefreshAsync(profileAlias string, cancellationToken CancellationToken = default(CancellationToken)) Task[
        AuthSession
    ];
}
