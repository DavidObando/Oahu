// G# port of src/Oahu.Cli.App/Auth/FakeAuthService.cs.
// Reuses C# IAuthService, AuthSession, AuthCredentials, IAuthCallbackBroker,
// CliRegion from the referenced Oahu.Cli.App assembly. Skipped: CoreAuthService
// (368L, Oahu.Core/AudibleLogin internals) and CallbackBridge (Oahu.Core bridge).

package Oahu.Cli.App.Experiment.Auth

import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Models

type ExpFakeAuthService class : IAuthService {
    syncRoot object = Object()
    sessions List[AuthSession] = List[AuthSession]()
    activeAlias string? = nil

    func ListSessionsAsync(ct CancellationToken) Task[IReadOnlyList[AuthSession]] {
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(syncRoot)
        var snap = sessions.ToArray()
        Monitor.Exit(syncRoot)
        return Task.FromResult[IReadOnlyList[AuthSession]](snap)
    }

    func GetActiveAsync(ct CancellationToken) Task[AuthSession?] {
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(syncRoot)
        var found AuthSession? = nil
        for s in sessions {
            if s.ProfileAlias == activeAlias {
                found = s
            }
        }
        Monitor.Exit(syncRoot)
        return Task.FromResult[AuthSession?](found)
    }

    func LoginAsync(region CliRegion, broker IAuthCallbackBroker, preAmazonUsername bool, ct CancellationToken) Task[AuthSession] {
        ct.ThrowIfCancellationRequested()

        var alias = region.ToString().ToLowerInvariant() + "-fake"
        var session = AuthSession() {
            ProfileAlias = alias,
            Region = region,
            AccountId = "acct-" + Guid.NewGuid().ToString("n"),
            AccountName = "Fake User",
            DeviceName = "fake-device",
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(1),
        }

        Monitor.Enter(syncRoot)
        removeAliasLocked(alias)
        sessions.Add(session)
        activeAlias = alias
        Monitor.Exit(syncRoot)
        return Task.FromResult(session)
    }

    func LoginWithCredentialsAsync(region CliRegion, broker IAuthCallbackBroker, credentials AuthCredentials, preAmazonUsername bool, ct CancellationToken) Task[AuthSession] {
        return LoginAsync(region, broker, preAmazonUsername, ct)
    }

    func LogoutAsync(profileAlias string, ct CancellationToken) Task {
        if String.IsNullOrWhiteSpace(profileAlias) {
            return Task.FromException(ArgumentException("profileAlias must not be empty"))
        }
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(syncRoot)
        removeAliasLocked(profileAlias)
        if activeAlias == profileAlias {
            if sessions.Count > 0 {
                var head = sessions[0]
                activeAlias = head.ProfileAlias
            } else {
                activeAlias = nil
            }
        }
        Monitor.Exit(syncRoot)
        return Task.CompletedTask
    }

    func RefreshAsync(profileAlias string, ct CancellationToken) Task[AuthSession] {
        if String.IsNullOrWhiteSpace(profileAlias) {
            return Task.FromException[AuthSession](ArgumentException("profileAlias must not be empty"))
        }
        ct.ThrowIfCancellationRequested()
        Monitor.Enter(syncRoot)
        var existing AuthSession? = nil
        for s in sessions {
            if s.ProfileAlias == profileAlias {
                existing = s
            }
        }
        if existing == nil {
            Monitor.Exit(syncRoot)
            return Task.FromException[AuthSession](InvalidOperationException("No session for profile '" + profileAlias + "'."))
        }
        var e = existing!!
        var refreshed = AuthSession() {
            ProfileAlias = e.ProfileAlias,
            Region = e.Region,
            AccountId = e.AccountId,
            AccountName = e.AccountName,
            DeviceName = e.DeviceName,
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(1),
        }
        removeAliasLocked(profileAlias)
        sessions.Add(refreshed)
        Monitor.Exit(syncRoot)
        return Task.FromResult(refreshed)
    }

    func removeAliasLocked(alias string) {
        var i = 0
        for i < sessions.Count {
            var s = sessions[i]
            if s.ProfileAlias == alias {
                sessions.RemoveAt(i)
            } else {
                i = i + 1
            }
        }
    }
}
