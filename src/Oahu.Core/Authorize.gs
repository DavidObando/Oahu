package Oahu.Core

import System
import System.Collections.Generic
import System.Linq
import System.Net.Http
import System.Net.Http.Headers
import System.Text
import System.Text.Json
import System.Threading.Tasks
import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.Core.Ex
import Oahu.Aux.Logging
import Oahu.Audible.Json

internal class Authorize {
    init(getTokenFunc ConfigTokenDelegate, settings IAuthorizeSettings) {
        Log(3, this)
        GetTokenFunc = getTokenFunc
        Settings = settings
    }

    prop HttpClientAmazon HttpClientEx? {
        get;
        private set;
    }

    prop HttpClientAudible HttpClientEx? {
        get;
        private set;
    }

    prop WeakConfigEncryptionCallback(() -> void)? {
        private get;
        set;
    }

    private prop Settings IAuthorizeSettings? {
        get;
        init;
    }

    // private Uri BaseUri => HttpClientAmazon?.BaseAddress;
    private prop Configuration Configuration?

    private prop GetTokenFunc ConfigTokenDelegate? {
        get;
        init;
    }

    async func RegisterAsync(profile Profile?)(bool, IProfile?) {
        using let logGuard = LogGuard(3, this)
        EnsureHttpClient(profile)
        try {
            let request = BuildRegisterRequest(profile)
            let http HttpClientEx? = HttpClient(profile)
            await request.LogAsync(4, this, http!!.DefaultRequestHeaders, http!!.CookieContainer, http!!.BaseAddress)
            let response = await http!!.SendAsync(request)
            await response.LogAsync(4, this, http!!.CookieContainer, http!!.BaseAddress)
            response.EnsureSuccessStatusCode()
            let content = await response.Content.ReadAsStringAsync()
            return await AddProfileToConfig(profile, content)
        } catch (exc Exception) {
            Log(1, this, () -> exc.Summary())
            return (false, nil)
        }
    }

    async func DeregisterAsync(profile IProfile) bool {
        EnsureHttpClient(profile)
        try {
            await RefreshTokenAsync(profile)
            let request = BuildDeregisterRequest(profile)
            let http HttpClientEx? = HttpClient(profile)
            await request.LogAsync(4, this, http!!.DefaultRequestHeaders, http!!.CookieContainer, http!!.BaseAddress)
            let response = await http!!.SendAsync(request)
            await response.LogAsync(4, this, http!!.CookieContainer, http!!.BaseAddress)
            response.EnsureSuccessStatusCode()
            let content = await response.Content.ReadAsStringAsync()
            return true
        } catch (exc Exception) {
            Log(1, this, () -> exc.Summary())
            return false
        }
    }

    async func RemoveProfileAsync(key IProfileKey) EAuthorizeResult {
        Log(3, this, () -> key.ToString())
        let profile IProfile? = Configuration!!.Remove(key)
        if profile == nil {
            return EAuthorizeResult.RemoveProfileFailed
        }
        await WriteConfigurationAsync()
        // TODO modify/test
        // bool succ = await DeregisterAsync (profile);
        // EAuthorizeResult result = succ ? EAuthorizeResult.Succ : EAuthorizeResult.DeregistrationFailed;
        // return result;
        return EAuthorizeResult.Succ
    }

    async func RefreshTokenAsync(profile IProfile) -> await RefreshTokenAsync(profile, false)

    async func GetRegisteredProfilesAsync() IEnumerable[IProfile]? {
        if Configuration == nil {
            await ReadConfigurationAsync()
        }
        return Configuration!!.GetSorted()
    }

    internal func GetProfile(key IProfileKey) IProfile? -> Configuration?.Get(key)

    // internal instead of private for testing only
    internal async func AddProfileToConfig(profile Profile?, content string)(bool, IProfile?) {
        let succ = UpdateProfile(profile, content)
        if !succ {
            return (false, nil)
        }
        await ReadConfigurationAsync()
        let prevProfile IProfile? = Configuration!!.AddOrReplace(profile)
        await WriteConfigurationAsync()
        return (true, prevProfile)
    }

    internal async func WriteConfigurationAsync() {
        Log(3, this)
        if Configuration == nil {
            return
        }
        let result ConfigurationTokenResult? = GetTokenFunc?(false)
        let existed = Configuration!!.Existed
        await Configuration!!.WriteAsync(result?.Token)
        if !existed && (result?.Weak ?? false) {
            WeakConfigEncryptionCallback?()
        }
    }

    internal async func RefreshTokenAsync(profile IProfile?, onAutoRefreshOnly bool) {
        using let logGuard = LogGuard(
            3,
            this,
            () -> "auto=${Settings?.AutoRefresh}, onAutoRefeshOnly=$onAutoRefreshOnly"
        )
        EnsureHttpClient(profile)
        await ReadConfigurationAsync()
        if onAutoRefreshOnly && (Settings?.AutoRefresh ?? false) {
            if profile is Profile prof1 && (Configuration!!.Profiles?.Contains(prof1) ?? false) {
                await RefreshTokenCoreAsync(prof1)
            } else {
                let prof2 Profile? = Configuration!!.Profiles?.FirstOrDefault((d Profile) -> d.Matches(profile))
                if prof2 != nil {
                    await RefreshTokenCoreAsync(prof2)
                }
            }
            await WriteConfigurationAsync()
        }
    }

    // internal instead of private for testing only
    internal func UpdateProfile(profile Profile?, json string) bool {
        try {
            if Logging.Level >= 3 {
                const REGISTRATION = "RegistrationResponse"
                if Logging.Level >= 4 {
                    json.WriteTempJsonFile(REGISTRATION)
                }
                let jsonCleaned string? = json.ExtractJsonStructure()
                if jsonCleaned != nil {
                    jsonCleaned.WriteTempJsonFile(REGISTRATION + "(cleared)")
                }
            }
            let root RegistrationResponse? = RegistrationResponse.Deserialize(json)
            if root == nil {
                return false
            }
            let response = root.Response
            let success = response.Success
            let extensions = success.Extensions
            let device_info = extensions.DeviceInfoJson
            let deviceInfo = DeviceInfo{
                Name: device_info.DeviceName,
                Type: device_info.DeviceType,
                Serial: device_info.DeviceSerialNumber
            }
            let customer_info = extensions.CustomerInfoJson
            let customerInfo = CustomerInfo{
                Name: customer_info.Name,
                GivenName: customer_info.GivenName,
                AccountId: customer_info.UserId
            }
            let tokens = success.Tokens
            let website_cookies[]?WebsiteCookies = tokens.WebsiteCookies
            let cookies = List[KeyValuePair[string, string]]()
            if website_cookies != nil {
                for cookie in website_cookies {
                    cookies.Add(KeyValuePair[string, string](cookie.Name, cookie.Value.Replace("\"", "")))
                }
            }
            let store_authentication_cookie = tokens.StoreAuthenticationCookie
            let storeAuthentCookie = store_authentication_cookie.Cookie
            let mac_dms = tokens.MacDms
            let devicePrivateKey = mac_dms.DevicePrivateKey
            let adpToken = mac_dms.AdpToken
            let bearer = tokens.Bearer
            int32.TryParse(bearer.ExpiresIn, out var expires)
            let tokenBearer = TokenBearer(bearer.AccessToken, bearer.RefreshToken, DateTime.UtcNow.AddSeconds(expires))
            profile!!.Update(
                tokenBearer,
                cookies,
                deviceInfo,
                customerInfo,
                devicePrivateKey,
                adpToken,
                storeAuthentCookie
            )
        } catch (exc Exception) {
            // Log (1, this, () => exc.Summary ());
            Log(1, this, () -> exc.ToString())
            return false
        }
        return true
    }

    private func HttpClient(profile IProfile?) HttpClientEx? -> if profile!!.PreAmazon {
        HttpClientAudible
    } else {
        HttpClientAmazon
    }

    private func EnsureHttpClient(profile IProfile?) {
        let domain = profile!!.Region.FromCountryCode()!!.Domain
        let EnsureHttpClient = func (authority string, httpClient HttpClientEx?) HttpClientEx? {
            let baseUri = Uri(authority + domain)
            if httpClient != nil {
                if httpClient.BaseAddress == baseUri {
                    return httpClient
                } else {
                    httpClient.Dispose()
                }
            }
            return HttpClientEx.Create(baseUri)
        }
        HttpClientAmazon = EnsureHttpClient(HttpAuthorityAmzn, HttpClientAmazon)
        HttpClientAudible = EnsureHttpClient(HttpAuthorityAdbl, HttpClientAudible)
    }

    private async func RefreshTokenCoreAsync(profile IProfile?) {
        if profile == nil {
            return
        }
        using let logGuard = LogGuard(3, this)
        try {
            if DateTime.UtcNow < profile.Token.Expiration - TimeSpan.FromMinutes(5) {
                return
            }
            Log(3, this, () -> "from server")
            let request = BuildRefreshRequest(profile)
            let http HttpClientEx? = HttpClient(profile)
            await request.LogAsync(4, this, http!!.DefaultRequestHeaders, http!!.CookieContainer, http!!.BaseAddress)
            let response = await http!!.SendAsync(request)
            await response.LogAsync(4, this, http!!.CookieContainer, http!!.BaseAddress)
            response.EnsureSuccessStatusCode()
            let content = await response.Content.ReadAsStringAsync()
            RefreshToken(profile, content)
        } catch (exc Exception) {
            Log(1, this, () -> exc.Summary())
        }
    }

    private func BuildRefreshRequest(profile IProfile?) HttpRequestMessage {
        let content = Dictionary[string, string]{
            ["app_name"] = AppName,
            ["app_version"] = AppVersion,
            ["source_token"] = profile!!.Token.RefreshToken!!,
            ["requested_token_type"] = "access_token",
            ["source_token_type"] = "refresh_token"
        }
        let http HttpClientEx? = HttpClient(profile)
        let uri = Uri(HttpPathToken, UriKind.Relative)
        let request = HttpRequestMessage{
            Method: HttpMethod.Post,
            RequestUri: uri,
            Content: FormUrlEncodedContent(content)
        }
        request.Headers.Add("x-amzn-identity-auth-domain", http!!.BaseAddress!!.Host)
        request.Headers.Add("Accept", "application/json")
        return request
    }

    private func RefreshToken(profile IProfile?, json string) {
        try {
            let jsonDoc = JsonDocument.Parse(json)
            let elRoot = jsonDoc.RootElement
            let accessToken string? = elRoot.GetProperty("access_token").GetString()
            let expires = elRoot.GetProperty("expires_in").GetInt32()
            let expiration = DateTime.UtcNow.AddSeconds(expires)
            let bearer = TokenBearer(
                elRoot.GetProperty("access_token").GetString(),
                DateTime.UtcNow.AddSeconds(expires)
            )
            profile!!.Refresh(bearer)
        } catch (exc Exception) {
            Log(1, this, () -> exc.Summary())
        }
    }

    private async func ReadConfigurationAsync() {
        let ReadConfigAsync = async func (enforce bool) {
            let cfgToken ConfigurationTokenResult? = GetTokenFunc?(enforce)
            await Configuration!!.ReadAsync(cfgToken?.Token)
        }
        using let logGuard = LogGuard(3, this)
        if Configuration != nil {
            return
        }
        Configuration = Configuration()
        await ReadConfigAsync(false)
        if Configuration!!.IsEncrypted {
            await ReadConfigAsync(true)
        }
    }

    private func BuildRegisterRequest(profile IProfile?) HttpRequestMessage {
        let locale ILocale? = profile!!.Region.FromCountryCode()
        let uri = Uri(HttpPathRegister, UriKind.Relative)
        let jsonBody = BuildRegisterBody(profile, locale)
        let content HttpContent = StringContent(jsonBody, Encoding.UTF8, "application/json")
        let request = HttpRequestMessage{Method: HttpMethod.Post, RequestUri: uri, Content: content}
        request.Headers.Accept.Add(MediaTypeWithQualityHeaderValue("application/json"))
        return request
    }

    private func BuildDeregisterRequest(profile IProfile) HttpRequestMessage {
        let uri = Uri(HttpPathDeregister, UriKind.Relative)
        let content = Dictionary[string, string]{["deregister_all_existing_accounts"] = "false"}
        let request = HttpRequestMessage{
            Method: HttpMethod.Post,
            RequestUri: uri,
            Content: FormUrlEncodedContent(content)
        }
        request.Headers.Add("Authorization", "Bearer ${profile.Token.AccessToken}")
        request.Headers.Add("Accept", "application/json")
        return request
    }

    private func BuildRegisterBody(profile IProfile?, locale ILocale?) string {
        var json = (`{
        "requested_token_type":
            ["bearer", "mac_dms", "store_authentication_cookie",
             "website_cookies"],
        "cookies": {
          "domain": ".amazon.` + "${locale!!.Domain}" + `",
          "website_cookies": []
        },
        "registration_data": {
          "domain": "Device",
          "device_type": "` + "${AudibleLogin.DeviceType}" + `",
          "device_serial": "` + "${profile!!.DeviceInfo!!.Serial}" + `",
          "app_name": "` + "$AppName" + `",
          "app_version": "` + "$AppVersion" + `",
          "device_model": "` + "$DeviceModel" + `",
          "os_version": "` + "$OsVersion" + `",
          "software_version": "` + "$SoftwareVersion" + `",
          "device_name":
              "%FIRST_NAME%%FIRST_NAME_POSSESSIVE_STRING%%DUPE_STRATEGY_1ST%` + "$DeviceName" + `"
        },
        "auth_data": {
          "authorization_code": "` + "${profile!!.Authorization.AuthorizationCode}" + `",
          "code_verifier": "` + "${profile!!.Authorization.CodeVerifier}" + `",
          "code_algorithm": "SHA-256",
          "client_domain": "DeviceLegacy",
          "client_id": "` + "${AudibleLogin.BuildClientId(profile!!.DeviceInfo!!.Serial)}" + `"
        },
        "requested_extensions": ["device_info", "customer_info"]
      }`)
        if Logging.Level >= 4 {
            let file = json.WriteTempTextFile()
            Log(4, this, () -> "buildRegisterBody: $file")
        }
        json = json.CompactJson()
        if !json.ValidateJson() {
            throw InvalidOperationException("invalid json")
        }
        return json
    }

    shared {
        // Identity of the client this app registers as. Mirrors the Audible-for-iPhone registration
        // performed by mkb79/Audible. The previous emulated Audible-for-Android client (device type
        // A10KISP2GWF0E4, an Android Studio emulator running a userdebug/dev-keys build) stopped being
        // granted download licenses on 2026-09-02: Audible answers every license request from it with
        // [Client/RequesterEligibility] "AAA/LWA does not has access to asin".
        // See rmcrackan/Libation#2021 and mkb79/audible-cli#317.
        internal const OsVersion string = "15.0.0"

        internal const AppVersion string = "3.56.2"
        internal const AppVersionName string = "3.56.2"
        internal const SoftwareVersion string = "35602678"
        internal const AppName string = "Audible"
        internal const DeviceModel string = "iPhone"
        internal const DeviceName string = "Audible for iPhone"
        private const HttpAuthorityAmzn string = "https://api.amazon."
        private const HttpAuthorityAdbl string = "https://api.audible."
        private const HttpPathRegister string = "/auth/register"
        private const HttpPathDeregister string = "/auth/deregister"
        private const HttpPathToken string = "/auth/token"
    }
}
