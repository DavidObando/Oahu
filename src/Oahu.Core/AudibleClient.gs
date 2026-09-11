package Oahu.Core

import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.Aux.Logging
import Oahu.CommonTypes
import Oahu.Core.Ex
import System
import System.Collections.Generic
import System.Linq
import System.Text
import System.Threading.Tasks

class AudibleClient {
    private var audibleApi IAudibleApi?
    private var hardwareIdProvider IHardwareIdProvider?

    init(
        configSettings ConfigSettings,
        authSettings IAuthorizeSettings,
        hardwareIdProvider IHardwareIdProvider? = nil,
        dbDir string? = nil
    ) {
        Log(3, this)
        this.hardwareIdProvider = hardwareIdProvider
        ConfigSettings = configSettings
        if ConfigSettings != nil {
            this.ConfigSettings.ChangedSettings += SettingsChangedSettings
        }
        AuthorizeSettings = authSettings
        BookLibrary = BookLibrary(dbDir)
        Authorize = Authorize(GetConfigurationToken, authSettings)
        AudibleLogin = AudibleLogin()
    }

    prop ProfileKey IProfileKey? -> Profile?.Key
    prop ProfileAliasKey IProfileAliasKey? -> Profile?.AliasKey
    prop CurrentCustomerName string? -> Profile?.Profile?.CustomerInfo?.Name
    prop CurrentGivenName string? -> Profile?.Profile?.CustomerInfo?.GivenName

    prop ConfigSettings ConfigSettings? {
        get;
        init;
    }

    prop BookLibraryExcerpt IBookLibrary -> BookLibrary

    prop WeakConfigEncryptionCallback() -> void {
        set -> this.Authorize!!.WeakConfigEncryptionCallback = value
    }

    prop Api IAudibleApi? {
        get {
            if audibleApi == nil {
                if Profile == nil {
                    return nil
                }
                audibleApi = AudibleApi(
                    Profile!!.Profile,
                    Authorize!!.HttpClientAmazon,
                    Authorize!!.HttpClientAudible,
                    BookLibrary,
                    Authorize!!.RefreshTokenAsync
                )
            }
            return audibleApi!!
        }
    }

    internal prop FullApi AudibleApi? -> audibleApi as AudibleApi

    private prop AudibleLogin AudibleLogin {
        get;
        init;
    }

    private prop Authorize Authorize? {
        get;
        init;
    }

    private prop BookLibrary BookLibrary {
        get;
        init;
    }

    private prop Profile ProfileBundle?

    private prop AuthorizeSettings IAuthorizeSettings {
        get;
        init;
    }

    async func ConfigFromExternalLoginAsync(
        region ERegion,
        withPreAmazonUsername bool,
        callbacks Callbacks
    ) RegisterResult? {
        Log(3, this, () -> "reg=$region, preAmznAccnt=$withPreAmazonUsername")
        let uri = ConfigBuildNewLoginUri(region, withPreAmazonUsername)
        if callbacks.ExternalLoginCallback == nil {
            return nil
        }
        let responseUri = callbacks.ExternalLoginCallback(uri)
        let result = await ConfigParseExternalLoginResponseAsync(responseUri, callbacks)
        return result
    }

    async func ConfigFromProgrammaticLoginAsync(
        region ERegion,
        withPreAmazonUsername bool,
        credentials Credentials,
        callbacks Callbacks
    ) RegisterResult {
        Log(3, this, () -> "reg=$region, preAmznAccnt=$withPreAmazonUsername")
        // Run on thread pool to avoid capturing the UI synchronization context.
        // The synchronous challenge callbacks (CaptchaCallback, MfaCallback, etc.) use
        // Dispatcher.UIThread.Post + TaskCompletionSource.Wait, which deadlocks if
        // the callback fires on the UI thread due to sync context capture.
        return await Task.Run[RegisterResult](
            async () -> {
                // Build OAuth URI (this also generates Serial, ClientId, CodeVerifier in AudibleLogin)
                let oauthUri = ConfigBuildNewLoginUri(region, withPreAmazonUsername)
                // Perform programmatic login to obtain the redirect URI with authorization code
                let locale ILocale? = region.FromCountryCode()
                let programmaticLogin = ProgrammaticLogin()
                let responseUri Uri? = await programmaticLogin.LoginAsync(
                    locale,
                    withPreAmazonUsername,
                    oauthUri,
                    AudibleLogin.Serial,
                    credentials,
                    callbacks
                )
                if responseUri == nil {
                    Log(1, this, () -> "Programmatic login returned no response URI")
                    return RegisterResult(EAuthorizeResult.AuthorizationFailed, nil, nil)
                }
                // Parse the response and complete device registration (same as external login)
                return await ConfigParseExternalLoginResponseAsync(responseUri, callbacks)
            }
        )
    }

    func ConfigBuildNewLoginUri(region ERegion, withPreAmazonUsername bool) Uri {
        Log(3, this, () -> "reg=$region, preAmznAccnt=$withPreAmazonUsername")
        DisposeProfileAndApi()
        return AudibleLogin.BuildAuthUri(region, withPreAmazonUsername)
    }

    async func ConfigParseExternalLoginResponseAsync(uri Uri?, callbacks Callbacks) RegisterResult {
        using let logGuard = LogGuard(3, this)
        let profile Profile? = AudibleLogin.ParseExternalResponse(uri)
        if profile == nil {
            Log(1, this, () -> "response parsing failed.")
            return RegisterResult(EAuthorizeResult.AuthorizationFailed, nil, nil)
        }
        let (succ, prevProfile) = await Authorize!!.RegisterAsync(profile)
        if !succ {
            return RegisterResult(EAuthorizeResult.RegistrationFailed, nil, nil)
        }
        var result = EAuthorizeResult.Succ
        if profile.Matches(prevProfile) {
            Profile = nil
        }
        // TODO modify/test
        // bool deregister = prevProfile is not null &&
        //  (callbacks.DeregisterDeviceConfirmCallback?.Invoke (prevProfile.CreateKeyEx ()) ?? true);
        // if (deregister) {
        //  succ = await Authorize.DeregisterAsync (prevProfile);
        //  if (!succ)
        //    result = EAuthorizeResult.DeregistrationFailed;
        // }
        let deregister = prevProfile != nil
        if deregister {
            result = EAuthorizeResult.DeregistrationFailed
        }
        return RegisterResult(result, profile.CreateKeyEx(), prevProfile?.DeviceInfo?.Name)
    }

    async func ConfigFromFileAsync(
        aliasKey IProfileAliasKey?,
        getAccountAliasFunc((AccountAliasContext) -> bool)?
    ) IProfileAliasKey? {
        Log(3, typeof(AudibleClient), () -> aliasKey?.ToString())
        DisposeProfileAndApi()
        let resultKey IProfileAliasKey? = await FromFileAsync(aliasKey, getAccountAliasFunc)
        return resultKey
    }

    func GetAccountAliases() IEnumerable[AccountAlias] -> BookLibrary.GetAccountAliases()

    func SetAccountAlias(key IProfileKey, alias string) -> BookLibrary.SetAccountAlias(key, alias)

    async func GetProfileAliasAsync(
        key IProfileKey,
        getAccountAliasFunc((AccountAliasContext) -> bool)?,
        newAlias bool
    ) string? {
        let profiles IEnumerable[IProfile]? = await Authorize!!.GetRegisteredProfilesAsync()
        if profiles == nil {
            return nil
        }
        let profile IProfile? = profiles.FirstOrDefault(
            (p IProfile) -> p.Region == key.Region && string.Equals(p.CustomerInfo!!.AccountId, key.AccountId)
        )
        if profile == nil {
            return nil
        }
        let alias string? = profile.GetAccountAlias(BookLibrary, getAccountAliasFunc, newAlias)
        return alias
    }

    async func GetProfilesAsync() IEnumerable[IProfileKeyEx]? {
        Log(3, this)
        let profiles IEnumerable[IProfile]? = await Authorize!!.GetRegisteredProfilesAsync()
        if profiles == nil {
            return nil
        }
        let profileKeys = profiles.Select((p IProfile) -> p.CreateKeyEx()).ToList()
        return profileKeys
    }

    async func RemoveProfileAsync(key IProfileKey) EAuthorizeResult {
        Log(3, this, () -> key.ToString())
        let result = await Authorize!!.RemoveProfileAsync(key)
        if result >= EAuthorizeResult.Succ {
            BookLibrary.RemoveAccountId(key)
            SetProfile(nil, nil)
        }
        return result
    }

    async func RemoveAllProfilesAsync() bool {
        let profiles IEnumerable[IProfileKeyEx]? = await GetProfilesAsync()
        if profiles == nil {
            DisposeProfileAndApi()
            return true
        }
        var allRemoved = true
        for profile in profiles.ToList() {
            let result = await RemoveProfileAsync(profile)
            allRemoved &= result >= EAuthorizeResult.Succ
        }
        return allRemoved
    }

    async func ChangeProfileAsync(key IProfileKey, aliasChanged bool) bool? {
        Log(3, this, () -> key.ToString())
        // Key may be the same but profile could still be different, check Id instead
        let profileChanged = !Profile.MatchesId(key)
        if !profileChanged && !aliasChanged {
            return false
        }
        Log(3, this, () -> Authorize?.GetProfile(key)?.CreateAliasKey(BookLibrary, nil)?.ToString())
        DisposeProfileAndApi()
        let profiles IEnumerable[IProfile]? = await Authorize!!.GetRegisteredProfilesAsync()
        if profiles == nil {
            return nil
        }
        let profile IProfile? = profiles.FirstOrDefault((p IProfile) -> p.Matches(key))
        if profile == nil {
            return nil
        }
        SetProfile(profile, nil)
        if profileChanged {
            await Authorize!!.RefreshTokenAsync(profile, true)
        }
        return true
    }

    private func SetProfile(profile IProfile?, getAccountAliasFunc((AccountAliasContext) -> bool)?) IProfileAliasKey? {
        if profile == nil {
            Profile = nil
            return nil
        }
        let key = profile.CreateKey()
        let aliasKey IProfileAliasKey? = profile.CreateAliasKey(BookLibrary, getAccountAliasFunc)
        Profile = ProfileBundle(profile, key, aliasKey)
        return aliasKey
    }

    private func DisposeProfileAndApi() {
        Profile = nil
        audibleApi?.Dispose()
        audibleApi = nil
    }

    private async func SettingsChangedSettings(sender object, e EventArgs) void {
        await Authorize!!.WriteConfigurationAsync()
    }

    private func GetConfigurationToken(enforce bool) ConfigurationTokenResult? {
        if !(ConfigSettings?.EncryptConfiguration ?? false) && !enforce {
            return default(ConfigurationTokenResult)
        }
        var weak = false
        let sb = StringBuilder()
        let uid = ApplEnv.UserName.Rot13()
        sb.Append(uid)
        let cid string? = hardwareIdProvider?.GetCpuId()
        if cid.IsNullOrWhiteSpace() {
            weak = true
        } else {
            sb.Append(cid)
        }
        var mbId string? = hardwareIdProvider?.GetMotherboardId()
        if mbId.IsNullOrWhiteSpace() {
            mbId = hardwareIdProvider?.GetMotherboardPnpDeviceId()
        }
        if mbId.IsNullOrWhiteSpace() {
            weak = true
        } else {
            sb.Append(mbId)
        }
        return ConfigurationTokenResult(sb.ToString(), weak)
    }

    private async func FromFileAsync(
        aliasKey IProfileAliasKey?,
        getAccountAliasFunc((AccountAliasContext) -> bool)?
    ) IProfileAliasKey? {
        let accountAlisases = GetAccountAliases()
        var profiles IEnumerable[IProfile]? = await Authorize!!.GetRegisteredProfilesAsync()
        if profiles == nil {
            return nil
        }
        if aliasKey != nil {
            profiles = profiles.Where((p IProfile) -> p.Region == aliasKey.Region)
            if !aliasKey.AccountAlias.IsNullOrWhiteSpace() {
                let accountId string? = accountAlisases.FirstOrDefault(
                    (aa AccountAlias) -> aa.Alias == aliasKey.AccountAlias
                )
                    ?.AccountId
                if accountId != nil {
                    profiles = profiles.Where((p IProfile) -> string.Equals(p.CustomerInfo!!.AccountId, accountId))
                }
            }
        }
        if !profiles!!.Any() {
            return nil
        }
        let profile = profiles!!.First()
        await Authorize!!.RefreshTokenAsync(profile, true)
        let resultKey IProfileAliasKey? = SetProfile(profile, getAccountAliasFunc)
        return resultKey
    }
}
