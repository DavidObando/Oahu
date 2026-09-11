package Oahu.Cli.App.Credentials

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// Sentinel store returned when no native keyring is available. Every method throws
/// (cref:CredentialStoreUnavailableException), signalling the caller (typically
/// `oahu-cli auth login`) to print a clear diagnostic with remediation steps
/// rather than fall back to insecure file storage.
class UnsupportedCredentialStore : ICredentialStore {
    private let reason string

    init(reason string) {
        this.reason = reason
    }

    prop Provider string -> "unsupported"

    func GetAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) Task[string?] {
        throw Make()
    }

    func SetAsync(
        account string,
        secret string,
        cancellationToken CancellationToken = default(CancellationToken)
    ) Task {
        throw Make()
    }

    func DeleteAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) Task[bool] {
        throw Make()
    }

    func ListAccountsAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[
        IReadOnlyList[string]
    ] {
        throw Make()
    }

    private func Make() CredentialStoreUnavailableException -> CredentialStoreUnavailableException(reason)
}

class CredentialStoreUnavailableException : Exception {
    init(reason string) : base("No supported credential store is available on this system: $reason") { }
}
