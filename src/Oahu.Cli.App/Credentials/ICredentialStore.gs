package Oahu.Cli.App.Credentials

import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// Stores opaque secrets keyed by an account alias. Implementations bind to the
/// platform's native keyring (DPAPI / Keychain / libsecret); when no native keyring
/// is available the factory returns (cref:UnsupportedCredentialStore) so the
/// CLI can fail closed with a clear error rather than silently store secrets in
/// a file.
interface ICredentialStore {
    /// Identifier used by the CLI when surfacing diagnostics ("dpapi", "keychain", "secret-tool",
    /// "unsupported").
    prop Provider string {
        get;
    }

    func GetAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) Task[string?];

    func SetAsync(account string, secret string, cancellationToken CancellationToken = default(CancellationToken)) Task;

    func DeleteAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) Task[bool];

    func ListAccountsAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[
        IReadOnlyList[string]
    ];
}
