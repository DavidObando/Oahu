package Oahu.Cli.App.Auth

import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import SystemObject = System.Object

/// In-memory (cref:IAuthService) for tests and for offline development.
class FakeAuthService : IAuthService {
    private let $lock object = SystemObject()
    private let sessions List[AuthSession] = List[AuthSession]()
    private var activeAlias string?

    func ListSessionsAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[
        IReadOnlyList[AuthSession]
    ] {
        cancellationToken.ThrowIfCancellationRequested()
        lock $lock {
            return Task.FromResult[IReadOnlyList[AuthSession]](sessions.ToArray())
        }
    }

    func GetActiveAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[AuthSession?] {
        cancellationToken.ThrowIfCancellationRequested()
        lock $lock {
            return Task.FromResult(sessions.FirstOrDefault((s AuthSession) -> s.ProfileAlias == activeAlias))
        }
    }

    func LoginAsync(
        region CliRegion,
        broker IAuthCallbackBroker,
        preAmazonUsername bool = false,
        cancellationToken CancellationToken = default(CancellationToken)
    ) Task[AuthSession] {
        ArgumentNullException.ThrowIfNull(broker)
        cancellationToken.ThrowIfCancellationRequested()
        // Fakes don't actually call broker; tests drive the broker explicitly when needed.
        let alias = "${region.ToString().ToLowerInvariant()}-fake"
        let session = AuthSession{
            ProfileAlias: alias,
            Region: region,
            AccountId: "acct-${Guid.NewGuid():n}",
            AccountName: "Fake User",
            DeviceName: "fake-device",
            ExpiresAt: DateTimeOffset.UtcNow.AddHours(1.0)
        }
        lock $lock {
            sessions.RemoveAll((s AuthSession) -> s.ProfileAlias == alias)
            sessions.Add(session)
            activeAlias = alias
        }
        return Task.FromResult(session)
    }

    func LoginWithCredentialsAsync(
        region CliRegion,
        broker IAuthCallbackBroker,
        credentials AuthCredentials,
        preAmazonUsername bool = false,
        cancellationToken CancellationToken = default(CancellationToken)
    ) Task[AuthSession] {
        ArgumentNullException.ThrowIfNull(credentials)
        // The fake doesn't actually authenticate; treat credentials sign-in as
        // equivalent to the browser path so tests can drive either.
        return LoginAsync(region, broker, preAmazonUsername, cancellationToken)
    }

    func LogoutAsync(profileAlias string, cancellationToken CancellationToken = default(CancellationToken)) Task {
        ArgumentException.ThrowIfNullOrWhiteSpace(profileAlias)
        cancellationToken.ThrowIfCancellationRequested()
        lock $lock {
            sessions.RemoveAll((s AuthSession) -> s.ProfileAlias == profileAlias)
            if activeAlias == profileAlias {
                activeAlias = sessions.FirstOrDefault()?.ProfileAlias
            }
        }
        return Task.CompletedTask
    }

    func RefreshAsync(profileAlias string, cancellationToken CancellationToken = default(CancellationToken)) Task[
        AuthSession
    ] {
        ArgumentException.ThrowIfNullOrWhiteSpace(profileAlias)
        cancellationToken.ThrowIfCancellationRequested()
        lock $lock {
            let existing = sessions.FirstOrDefault(
                (s AuthSession) -> s.ProfileAlias == profileAlias
            ) ?? throw InvalidOperationException("No session for profile '$profileAlias'.")
            let refreshed = existing with{ExpiresAt = DateTimeOffset.UtcNow.AddHours(1.0)}
            sessions.RemoveAll((s AuthSession) -> s.ProfileAlias == profileAlias)
            sessions.Add(refreshed)
            return Task.FromResult(refreshed)
        }
    }
}
