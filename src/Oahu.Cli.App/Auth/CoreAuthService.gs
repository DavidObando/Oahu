package Oahu.Cli.App.Auth

import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import Oahu.Aux
import Oahu.Cli.App.Core
import Oahu.Cli.App.Models
import Oahu.CommonTypes
import Oahu.Core

/// Core-backed (cref:IAuthService). Wraps the singleton
/// (cref:AudibleClient) exposed by (cref:CoreEnvironment):
/// profiles map to (cref:AuthSession), aliases come from the books DB
/// ((cref:AudibleClient.GetAccountAliases)), and sign-in routes through
/// (cref:AudibleClient.ConfigBuildNewLoginUri) +
/// (cref:AudibleClient.ConfigParseExternalLoginResponseAsync).
class CoreAuthService : IAuthService {
    private let client AudibleClient

    convenience init() {
        init(CoreEnvironment.Client)
    }

    init(client AudibleClient) {
        this.client = client ?? throw ArgumentNullException("client")
    }

    async func ListSessionsAsync(cancellationToken CancellationToken = default(CancellationToken)) IReadOnlyList[
        AuthSession
    ] {
        cancellationToken.ThrowIfCancellationRequested()
        let profiles IEnumerable[IProfileKeyEx]? = await client.GetProfilesAsync().ConfigureAwait(false)
        if profiles == nil {
            return Array.Empty[AuthSession]()
        }
        let aliases = client.GetAccountAliases()?.ToDictionary(
            (a AccountAlias) -> a.AccountId,
            (a AccountAlias) -> a.Alias,
            StringComparer.Ordinal
        ) ??
            Dictionary[string, string](StringComparer.Ordinal)
        return profiles.Select((p IProfileKeyEx) -> ToSession(p, aliases)).ToArray()
    }

    async func GetActiveAsync(cancellationToken CancellationToken = default(CancellationToken)) AuthSession? {
        cancellationToken.ThrowIfCancellationRequested()
        // Try to load the GUI's "active" profile so ProfileKey reflects the
        // user's actual selection (otherwise we just pick the first).
        await CoreEnvironment.EnsureProfileLoadedAsync().ConfigureAwait(false)
        let sessions = await ListSessionsAsync(cancellationToken).ConfigureAwait(false)
        let current IProfileKey? = client.ProfileKey
        if current != nil {
            let match AuthSession? = sessions.FirstOrDefault(
                (s AuthSession) -> s.Region == ToCliRegion(current.Region) && string.Equals(
                    s.AccountId,
                    current.AccountId,
                    StringComparison.Ordinal
                )
            )
            if match != nil {
                return match
            }
        }
        return if sessions.Count > 0 {
            sessions[0]
        } else {
            default(AuthSession?)
        }
    }

    async func LoginAsync(
        region CliRegion,
        broker IAuthCallbackBroker,
        preAmazonUsername bool = false,
        cancellationToken CancellationToken = default(CancellationToken)
    ) AuthSession {
        ArgumentNullException.ThrowIfNull(broker)
        cancellationToken.ThrowIfCancellationRequested()
        let coreRegion = ToCoreRegion(region)
        let loginUri = client.ConfigBuildNewLoginUri(coreRegion, preAmazonUsername)
        let responseUri = await broker.CompleteExternalLoginAsync(ExternalLoginChallenge(loginUri), cancellationToken)
            .ConfigureAwait(false)
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, cancellationToken)
        // ConfigParseExternalLoginResponseAsync runs on whatever thread we're on —
        // it does no UI marshaling internally, but it can call the synchronous
        // callbacks. Since CompleteExternalLoginAsync already returned the URL,
        // those callbacks should not re-fire here; if they do, the bridge above
        // will block on the broker which is safe on a thread-pool thread.
        let result = await Task.Run(
            func () Task[RegisterResult]? {
                return client.ConfigParseExternalLoginResponseAsync(responseUri, callbacks)
            },
            cancellationToken
        )
            .ConfigureAwait(false)
        return await CompleteRegistrationAsync(result).ConfigureAwait(false)
    }

    async func LoginWithCredentialsAsync(
        region CliRegion,
        broker IAuthCallbackBroker,
        credentials AuthCredentials,
        preAmazonUsername bool = false,
        cancellationToken CancellationToken = default(CancellationToken)
    ) AuthSession {
        ArgumentNullException.ThrowIfNull(broker)
        ArgumentNullException.ThrowIfNull(credentials)
        cancellationToken.ThrowIfCancellationRequested()
        let coreRegion = ToCoreRegion(region)
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, cancellationToken)
        let coreCredentials = Credentials(credentials.Username, credentials.Password)
        // ConfigFromProgrammaticLoginAsync internally Task.Runs to keep the
        // synchronous CAPTCHA/MFA/CVF callbacks off the calling thread, so it
        // is safe to await directly here without an extra Task.Run wrapper.
        let result = await client.ConfigFromProgrammaticLoginAsync(
            coreRegion,
            preAmazonUsername,
            coreCredentials,
            callbacks
        )
            .ConfigureAwait(false)
        return await CompleteRegistrationAsync(result).ConfigureAwait(false)
    }

    async func LogoutAsync(profileAlias string, cancellationToken CancellationToken = default(CancellationToken)) {
        ArgumentException.ThrowIfNullOrWhiteSpace(profileAlias)
        cancellationToken.ThrowIfCancellationRequested()
        let key = await ResolveKeyByAliasAsync(profileAlias).ConfigureAwait(false) ??
            throw InvalidOperationException("No profile with alias '$profileAlias'.")
        let result = await client.RemoveProfileAsync(key).ConfigureAwait(false)
        if result < EAuthorizeResult.Succ {
            throw InvalidOperationException("Failed to remove profile '$profileAlias': $result.")
        }
    }

    async func RefreshAsync(
        profileAlias string,
        cancellationToken CancellationToken = default(CancellationToken)
    ) AuthSession {
        ArgumentException.ThrowIfNullOrWhiteSpace(profileAlias)
        cancellationToken.ThrowIfCancellationRequested()
        let key = await ResolveKeyByAliasAsync(profileAlias).ConfigureAwait(false) ??
            throw InvalidOperationException("No profile with alias '$profileAlias'.")
        // ChangeProfileAsync triggers a token refresh when the active profile
        // actually changes. Forcing aliasChanged=true makes it re-issue without
        // changing the alias when the profile was already active.
        await client.ChangeProfileAsync(key, aliasChanged: true).ConfigureAwait(false)
        let sessions = await ListSessionsAsync(cancellationToken).ConfigureAwait(false)
        return sessions.FirstOrDefault(
            (s AuthSession) -> string.Equals(s.ProfileAlias, profileAlias, StringComparison.Ordinal)
        ) ??
            throw InvalidOperationException("Profile '$profileAlias' disappeared after refresh.")
    }

    /// Shared post-registration translation: validate the (cref:RegisterResult)
    /// produced by either the browser or programmatic login path and convert it
    /// into an (cref:AuthSession). Throws (cref:InvalidOperationException)
    /// on any non-success outcome.
    ///
    /// In addition to translating the result, this:
    /// - activates the new profile via (cref:AudibleClient.ConfigFromFileAsync) (mirrors
    /// `Oahu.App/MainWindow.axaml.gs:144`) — this is what creates the local `Account` row, fires the alias
    /// callback, and sets (cref:AudibleClient.Api);
    /// - persists the alias key to `UserSettings.DownloadSettings.Profile` so the next CLI launch
    /// auto-loads the same profile.
    private async func CompleteRegistrationAsync(result RegisterResult?) AuthSession {
        if result == nil || result.NewProfileKey == nil {
            throw InvalidOperationException("Sign-in failed: ${result?.Result.ToString() ?? "no response"}.")
        }
        // EAuthorizeResult.DeregistrationFailed is currently emitted whenever a
        // previous profile existed even when sign-in succeeded (see comments in
        // AudibleClient.ConfigParseExternalLoginResponseAsync). Treat it as
        // success-with-warning; the caller is welcome to surface
        // result.PrevDeviceName.
        if result.Result != EAuthorizeResult.Succ && result.Result != EAuthorizeResult.DeregistrationFailed {
            throw InvalidOperationException("Sign-in failed: ${result.Result}.")
        }
        let newKey = result.NewProfileKey
        // Activate the profile by loading it from the persisted Audible config.
        // ConfigFromFileAsync threads our getAccountAliasFunc all the way down
        // to BookLibrary.SetAccountAlias(ctxt), which uses the *DB* account id
        // (ctxt.LocalId) — not the Audible profile id (key.Id). That's the only
        // path that correctly persists the alias for a freshly registered
        // profile; calling client.SetAccountAlias(key, alias) directly silently
        // no-ops because the Accounts row hasn't been created yet (it is
        // created inside SetProfile -> GetAccountAliasContext).
        //
        // Mirrors src/Oahu.App/MainWindow.axaml.gs:144 (LoadActiveProfileAsync).
        let defaultAlias = if !string.IsNullOrWhiteSpace(newKey!!.AccountName) {
            newKey!!.AccountName!!
        } else {
            newKey!!.AccountId!!
        }
        let SetDefaultAlias = func (ctxt AccountAliasContext) bool {
            if string.IsNullOrWhiteSpace(ctxt.Alias) {
                ctxt.Alias = defaultAlias
            }
            return true
        }
        try {
            // Filter to the region we just signed into so we don't accidentally
            // load a different region's profile when several are registered.
            let aliasKeyHint = ProfileAliasKey(newKey!!.Region, accountAlias: nil)
            await client.ConfigFromFileAsync(aliasKeyHint, SetDefaultAlias)!!.ConfigureAwait(false)
            // Mirror src/Oahu.App/MainWindow.axaml.gs:167 — wire the alias
            // callback onto the API so AudibleApi.EnsureAccountId() can install
            // the alias on the local Accounts row the first time it's queried
            // (e.g. inside the very next GetLibraryAsync call). Without this,
            // a freshly-registered profile whose Accounts row was created with
            // an empty alias by SetProfile cannot be re-resolved by
            // CoreLibraryService.SyncAsync's alias-based lookup.
            if client.Api != nil {
                client.Api!!.GetAccountAliasFunc = SetDefaultAlias
            }
        } catch {
            // Activation failure is non-fatal here — the registration itself
            // succeeded. The next CLI invocation (or an explicit
            // `oahu-cli auth refresh`) can pick the profile up from the
            // persisted DownloadSettings.Profile.

        }
        // Re-read the alias dictionary now that the activation step has had a
        // chance to insert the Accounts row + alias.
        let aliases = client.GetAccountAliases()?.ToDictionary(
            (a AccountAlias) -> a.AccountId,
            (a AccountAlias) -> a.Alias,
            StringComparer.Ordinal
        ) ??
            Dictionary[string, string](StringComparer.Ordinal)
        if !aliases.TryGetValue(newKey!!.AccountId!!, out var resolvedAlias) || string.IsNullOrWhiteSpace(
            resolvedAlias
        ) {
            // Belt-and-braces: if the activation path didn't install the alias
            // for any reason, do it now via the public API. By this point the
            // Accounts row exists so SetAccountAlias(key, alias) will succeed.
            client.SetAccountAlias(newKey!!, defaultAlias)
            aliases[newKey!!.AccountId!!] = defaultAlias
            resolvedAlias = defaultAlias
        }
        // Persist DownloadSettings.Profile so the next CLI launch auto-loads
        // this profile via CoreEnvironment.EnsureProfileLoadedAsync. Mirrors
        // src/Oahu.App/MainWindow.axaml.gs:155.
        try {
            let settings = CoreEnvironment.Settings
            settings.DownloadSettings.Profile = ProfileAliasKey(newKey!!.Region, resolvedAlias!!)
            settings.Save()
        } catch {
            // Settings unavailable (test wiring without CoreEnvironment.Initialize):
            // the in-process session still works because the profile was
            // activated above.

        }
        return ToSession(newKey!!, aliases)
    }

    private async func ResolveKeyByAliasAsync(profileAlias string) IProfileKey? {
        let aliases = client.GetAccountAliases()?.ToDictionary(
            (a AccountAlias) -> a.AccountId,
            (a AccountAlias) -> a.Alias,
            StringComparer.Ordinal
        ) ??
            Dictionary[string, string](StringComparer.Ordinal)
        let profiles IEnumerable[IProfileKeyEx]? = await client.GetProfilesAsync().ConfigureAwait(false)
        if profiles == nil {
            return nil
        }
        return profiles.FirstOrDefault(
            (p IProfileKeyEx) -> aliases.TryGetValue(p.AccountId!!, out var alias) && string.Equals(
                alias,
                profileAlias,
                StringComparison.Ordinal
            )
        )
    }

    shared {
        func ToCliRegion(region ERegion) CliRegion -> switch region {
            case ERegion.Us: CliRegion.Us
            case ERegion.Uk: CliRegion.Uk
            case ERegion.De: CliRegion.De
            case ERegion.Fr: CliRegion.Fr
            case ERegion.It: CliRegion.It
            case ERegion.Es: CliRegion.Es
            case ERegion.Jp: CliRegion.Jp
            case ERegion.Au: CliRegion.Au
            case ERegion.Ca: CliRegion.Ca
            case ERegion.In: CliRegion.In
            case ERegion.Br: CliRegion.Br
            default: throw ArgumentOutOfRangeException("region", region, nil)
        }

        func ToCoreRegion(region CliRegion) ERegion -> switch region {
            case CliRegion.Us: ERegion.Us
            case CliRegion.Uk: ERegion.Uk
            case CliRegion.De: ERegion.De
            case CliRegion.Fr: ERegion.Fr
            case CliRegion.It: ERegion.It
            case CliRegion.Es: ERegion.Es
            case CliRegion.Jp: ERegion.Jp
            case CliRegion.Au: ERegion.Au
            case CliRegion.Ca: ERegion.Ca
            case CliRegion.In: ERegion.In
            case CliRegion.Br: ERegion.Br
            default: throw ArgumentOutOfRangeException("region", region, nil)
        }

        private func ToSession(key IProfileKeyEx, aliases IReadOnlyDictionary[string, string]) AuthSession {
            let alias = if aliases.TryGetValue(key.AccountId!!, out var a) && !string.IsNullOrWhiteSpace(a) {
                a
            } else {
                (key.AccountName ?? key.AccountId)!!
            }
            return AuthSession{
                ProfileAlias: alias,
                Region: ToCliRegion(key.Region),
                AccountId: key.AccountId!!,
                AccountName: key.AccountName,
                DeviceName: key.DeviceName,
                ExpiresAt: nil
            }
        }

        private func ToSession(key IProfileKey, aliases IReadOnlyDictionary[string, string]) AuthSession {
            if key is IProfileKeyEx ex {
                return ToSession(ex, aliases)
            }
            let alias = if aliases.TryGetValue(key.AccountId!!, out var a) && !string.IsNullOrWhiteSpace(a) {
                a
            } else {
                key.AccountId!!
            }
            return AuthSession{
                ProfileAlias: alias,
                Region: ToCliRegion(key.Region),
                AccountId: key.AccountId!!,
                ExpiresAt: nil
            }
        }
    }
}
