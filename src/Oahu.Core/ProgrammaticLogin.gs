package Oahu.Core

import Oahu.Aux.Logging
import Oahu.CommonTypes
import Oahu.Core.Cryptography
import System
import System.Collections.Generic
import System.Linq
import System.Net
import System.Net.Http
import System.Net.NetworkInformation
import System.Net.Sockets
import System.Text
import System.Text.Json
import System.Text.Json.Nodes
import System.Text.RegularExpressions
import System.Threading.Tasks

/// Implements programmatic login to Amazon/Audible by simulating the Android Audible app's
/// authentication flow. This replaces the external browser approach that stopped working
/// when Amazon began requiring session cookies and proper User-Agent before serving the
/// sign-in page.
internal class ProgrammaticLogin {
    /// Perform programmatic login, returning the redirect URI that contains the authorization code.
    async func LoginAsync(
        locale ILocale?,
        withPreAmazonUsername bool,
        oauthUri Uri,
        deviceSerial string,
        credentials Credentials,
        callbacks Callbacks
    ) Uri? {
        let loginBaseUri = GetLoginBaseUri(locale, withPreAmazonUsername)
        let cookieDomain = GetCookieDomain(locale, withPreAmazonUsername)
        using let client = HttpClientEx.Create(loginBaseUri)
        ConfigureClient(client, locale, deviceSerial, cookieDomain)
        // GET the OAuth sign-in page directly (cookies frc/map-md/sid + UA are sufficient)
        Log(3, this, () -> "Getting OAuth page: $oauthUri")
        let (authCodeUri, response) = await GetFollowingRedirectsAsync(client, oauthUri, loginBaseUri)
        if authCodeUri != nil {
            return authCodeUri
        }
        response.EnsureSuccessStatusCode()
        let html = await response.Content.ReadAsStringAsync()
        // Parse form, submit credentials, handle challenges
        return await HandleLoginFlowAsync(client, loginBaseUri, html, credentials, callbacks, locale)
    }

    private async func HandleLoginFlowAsync(
        client HttpClientEx,
        baseUri Uri,
        html string,
        credentials Credentials,
        callbacks Callbacks,
        locale ILocale?
    ) Uri? {
        // Parse the login form
        let (action, method, inputs) = ParseForm(html)
        if action == nil {
            throw InvalidOperationException("Could not parse login form from response")
        }
        // Set credentials and encrypted metadata
        inputs!!["email"] = credentials.Username
        inputs!!["password"] = credentials.Password
        inputs!!["metadata1"] = GenerateEncryptedMetadata(locale, baseUri)
        Log(3, this, () -> "Submitting credentials...")
        // Submit and process result
        let (authCodeUri, response) = await SubmitFormAsync(client, baseUri, action, method, inputs)
        if authCodeUri != nil {
            return authCodeUri
        }
        let responseHtml = await response.Content.ReadAsStringAsync()
        return await ProcessChallengeAsync(client, baseUri, responseHtml, credentials, callbacks, locale)
    }

    private async func ProcessChallengeAsync(
        client HttpClientEx,
        baseUri Uri,
        html string,
        credentials Credentials?,
        callbacks Callbacks,
        locale ILocale?
    ) Uri? {
        // Captcha
        if html.Contains("auth-captcha-image", StringComparison.OrdinalIgnoreCase) || html.Contains(
            "captchacharacters",
            StringComparison.OrdinalIgnoreCase
        ) {
            Log(3, this, () -> "Captcha detected")
            return await HandleCaptchaAsync(client, baseUri, html, credentials, callbacks, locale)
        }
        // MFA / OTP
        if html.Contains("auth-mfa-form", StringComparison.OrdinalIgnoreCase) || html.Contains(
            "otpCode",
            StringComparison.OrdinalIgnoreCase
        ) {
            Log(3, this, () -> "MFA detected")
            return await HandleMfaAsync(client, baseUri, html, callbacks, locale)
        }
        // CVF (Customer Verification Flow)
        if html.Contains("cvf-widget", StringComparison.OrdinalIgnoreCase) || html.Contains(
            "auth-verify",
            StringComparison.OrdinalIgnoreCase
        ) {
            Log(3, this, () -> "CVF detected")
            return await HandleCvfAsync(client, baseUri, html, callbacks, locale)
        }
        // Approval alert (approve on another device)
        if html.Contains("auth-approve-form", StringComparison.OrdinalIgnoreCase) || html.Contains(
            "approval-alert",
            StringComparison.OrdinalIgnoreCase
        ) {
            Log(3, this, () -> "Approval required")
            return await HandleApprovalAsync(client, baseUri, html, callbacks, locale)
        }
        // Check for error messages
        let errorMatch = Regex.Match(
            html,
            "<div[^>]*class=\"[^\"]*a-alert-content[^\"]*\"[^>]*>(.*?)</div>",
            RegexOptions.Singleline | RegexOptions.IgnoreCase
        )
        let errorText string? = if errorMatch.Success {
            Regex.Replace(errorMatch.Groups[1].Value, "<[^>]+>", "").Trim()
        } else {
            default(string?)
        }
        if !string.IsNullOrWhiteSpace(errorText) {
            Log(1, this, () -> "Login error: $errorText")
        }
        throw InvalidOperationException(
            "Unexpected login response. ${(if errorText != nil { "Error: $errorText" } else { "Could not determine next step." })}"
        )
    }

    private async func HandleCaptchaAsync(
        client HttpClientEx,
        baseUri Uri,
        html string,
        credentials Credentials?,
        callbacks Callbacks,
        locale ILocale?
    ) Uri? {
        if callbacks.CaptchaCallback == nil {
            throw InvalidOperationException("Captcha required but no CaptchaCallback provided")
        }
        // Extract captcha image URL
        var imgMatch = Regex.Match(
            html,
            "<img[^>]*\\bid\\s*=\\s*\"auth-captcha-image\"[^>]*\\bsrc\\s*=\\s*\"([^\"]*)\"",
            RegexOptions.IgnoreCase
        )
        if !imgMatch.Success {
            imgMatch = Regex.Match(
                html,
                "<img[^>]*\\bsrc\\s*=\\s*\"(https?://[^\"]*captcha[^\"]*)\"",
                RegexOptions.IgnoreCase
            )
        }
        if !imgMatch.Success {
            throw InvalidOperationException("Captcha required but could not find captcha image")
        }
        let imageUrl = WebUtility.HtmlDecode(imgMatch.Groups[1].Value)
        let imageBytes = await client.GetByteArrayAsync(imageUrl)
        let answer = callbacks.CaptchaCallback!!(imageBytes)
        if string.IsNullOrEmpty(answer) {
            throw OperationCanceledException("Captcha not solved by user")
        }
        // Parse form and submit with captcha answer
        let (action, method, inputs) = ParseForm(html)
        if action == nil {
            throw InvalidOperationException("Could not parse captcha form")
        }
        // Amazon uses either "guess" or "captchacharacters" for the captcha input
        if inputs!!.ContainsKey("guess") {
            inputs!!["guess"] = answer
        } else {
            inputs!!["captchacharacters"] = answer
        }
        inputs!!["metadata1"] = GenerateEncryptedMetadata(locale, baseUri)
        let (authCodeUri, response) = await SubmitFormAsync(client, baseUri, action, method, inputs)
        if authCodeUri != nil {
            return authCodeUri
        }
        let responseHtml = await response.Content.ReadAsStringAsync()
        return await ProcessChallengeAsync(client, baseUri, responseHtml, credentials, callbacks, locale)
    }

    private async func HandleMfaAsync(
        client HttpClientEx,
        baseUri Uri,
        html string,
        callbacks Callbacks,
        locale ILocale?
    ) Uri? {
        if callbacks.MfaCallback == nil {
            throw InvalidOperationException("MFA required but no MfaCallback provided")
        }
        let code = callbacks.MfaCallback!!()
        if string.IsNullOrEmpty(code) {
            throw OperationCanceledException("MFA code not provided by user")
        }
        let (action, method, inputs) = ParseForm(html)
        if action == nil {
            throw InvalidOperationException("Could not parse MFA form")
        }
        inputs!!["otpCode"] = code
        inputs!!["metadata1"] = GenerateEncryptedMetadata(locale, baseUri)
        let (authCodeUri, response) = await SubmitFormAsync(client, baseUri, action, method, inputs)
        if authCodeUri != nil {
            return authCodeUri
        }
        let responseHtml = await response.Content.ReadAsStringAsync()
        return await ProcessChallengeAsync(client, baseUri, responseHtml, nil, callbacks, locale)
    }

    private async func HandleCvfAsync(
        client HttpClientEx,
        baseUri Uri,
        html string,
        callbacks Callbacks,
        locale ILocale?
    ) Uri? {
        if callbacks.CvfCallback == nil {
            throw InvalidOperationException("CVF required but no CvfCallback provided")
        }
        let code = callbacks.CvfCallback!!()
        if string.IsNullOrEmpty(code) {
            throw OperationCanceledException("CVF code not provided by user")
        }
        let (action, method, inputs) = ParseForm(html)
        if action == nil {
            throw InvalidOperationException("Could not parse CVF form")
        }
        // Set the verification code in the appropriate field
        if inputs!!.ContainsKey("code") {
            inputs!!["code"] = code
        } else if inputs!!.ContainsKey("otpCode") {
            inputs!!["otpCode"] = code
        } else {
            inputs!!["cvf_challenge_response"] = code
        }
        let (authCodeUri, response) = await SubmitFormAsync(client, baseUri, action, method, inputs)
        if authCodeUri != nil {
            return authCodeUri
        }
        let responseHtml = await response.Content.ReadAsStringAsync()
        return await ProcessChallengeAsync(client, baseUri, responseHtml, nil, callbacks, locale)
    }

    private async func HandleApprovalAsync(
        client HttpClientEx,
        baseUri Uri,
        html string,
        callbacks Callbacks,
        locale ILocale?
    ) Uri? {
        callbacks.ApprovalCallback?()
        // Parse the approval form and submit (user has approved on their device)
        let (action, method, inputs) = ParseForm(html)
        if action == nil {
            throw InvalidOperationException("Could not parse approval form")
        }
        let (authCodeUri, response) = await SubmitFormAsync(client, baseUri, action, method, inputs)
        if authCodeUri != nil {
            return authCodeUri
        }
        let responseHtml = await response.Content.ReadAsStringAsync()
        return await ProcessChallengeAsync(client, baseUri, responseHtml, nil, callbacks, locale)
    }

    shared {
        private const BrowserUserAgent string = "Mozilla/5.0 (Linux; Android 14; sdk_gphone64_x86_64 Build/UPB5.230623.003; wv) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/113.0.5672.136 Mobile Safari/537.36"
        private const MapVersion string = "MAPAndroidLib-1.3.40908.0"
        private const MaxSessionCookieTries int32 = 6
        private const MaxRedirects int32 = 15
        private func GetLoginBaseUri(locale ILocale?, withPreAmazonUsername bool) Uri -> if withPreAmazonUsername {
            Uri("https://www.audible.${locale!!.Domain}")
        } else {
            Uri("https://www.amazon.${locale!!.Domain}")
        }

        private func GetCookieDomain(locale ILocale?, withPreAmazonUsername bool) string -> if withPreAmazonUsername {
            ".audible.${locale!!.Domain}"
        } else {
            ".amazon.${locale!!.Domain}"
        }

        private func GetLanguage(locale ILocale?) string -> switch locale!!.CountryCode {
            case ERegion.De: "de-DE"
            case ERegion.Fr: "fr-FR"
            case ERegion.It: "it-IT"
            case ERegion.Es: "es-ES"
            case ERegion.Br: "pt-BR"
            case ERegion.Jp: "ja-JP"
            case ERegion.In: "en-IN"
            case ERegion.Au: "en-AU"
            case ERegion.Ca: "en-CA"
            case ERegion.Uk: "en-GB"
            default: "en-US"
        }

        private func ConfigureClient(client HttpClientEx, locale ILocale?, deviceSerial string, cookieDomain string) {
            client.Timeout = TimeSpan.FromSeconds(30)
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", BrowserUserAgent)
            client.DefaultRequestHeaders.Add("Accept-Language", GetLanguage(locale))
            // Inject the three required cookies that Amazon checks before serving the sign-in page
            let frc = CreateFrcCookie(locale, deviceSerial)
            let mapMd = CreateMapMdCookie()
            client.CookieContainer.Add(Cookie("frc", frc, "/ap", cookieDomain))
            client.CookieContainer.Add(Cookie("map-md", mapMd, "/ap", cookieDomain))
            client.CookieContainer.Add(Cookie("sid", "", "/", cookieDomain))
        }

        private func CreateFrcCookie(locale ILocale?, deviceSerial string) string {
            var ip IPAddress
            try {
                ip = NetworkInterface
                    .GetAllNetworkInterfaces()
                    .Select((i NetworkInterface) -> i.GetIPProperties())
                    .SelectMany(
                    func (p IPInterfaceProperties) IEnumerable[IPAddress] {
                        return p
                            .DnsAddresses
                            .Concat(p.GatewayAddresses.Select((a GatewayIPAddressInformation) -> a.Address))
                            .Concat(p.UnicastAddresses.Select((a UnicastIPAddressInformation) -> a.Address))
                    }
                )
                    .Where(
                    (a IPAddress) -> (a.AddressFamily is AddressFamily.InterNetwork or AddressFamily.InterNetworkV6)
                )
                    .OrderBy((a IPAddress) -> a.AddressFamily != AddressFamily.InterNetworkV6)
                    .OrderByDescending(
                    (a IPAddress) -> !a.IsIPv6LinkLocal && !a.IsIPv6SiteLocal && !a.IsIPv6UniqueLocal
                )
                    .FirstOrDefault() ?? IPAddress.IPv6Any
            } catch {
                ip = IPAddress.IPv6Any
            }
            let tz = DateTimeOffset.Now.Offset
            let timeZone = (
                if tz.Ticks < int64(0) {
                    "-"
                } else {
                    ""
                }
            ) +
                "${tz:hh\:mm}"
            let deviceInfo = JsonObject(){
                ["ApplicationName"] = Authorize.AppName,
                ["ApplicationVersion"] = "2090254511",
                ["DeviceOSVersion"] = Authorize.OsVersion,
                ["DeviceName"] = Authorize.DeviceModel,
                ["ScreenWidthPixels"] = "1344",
                ["ThirdPartyDeviceId"] = deviceSerial,
                ["FirstPartyDeviceId"] = deviceSerial,
                ["ScreenHeightPixels"] = "2769",
                ["DeviceLanguage"] = GetLanguage(locale),
                ["TimeZone"] = timeZone,
                ["Carrier"] = "T-Mobile",
                ["IpAddress"] = ip.ToString()
            }
            return FrcEncoder.Encode(deviceSerial, deviceInfo.ToJsonString())
        }

        private func CreateMapMdCookie() string {
            let mapMd = JsonObject(){
                ["device_registration_data"] = JsonObject(){["software_version"] = Authorize.SoftwareVersion},
                ["app_identifier"] = JsonObject(){
                    ["package"] = Authorize.AppName,
                    ["SHA-256"] = nil,
                    ["app_version"] = Authorize.AppVersion,
                    ["app_version_name"] = Authorize.AppVersionName,
                    ["app_sms_hash"] = nil,
                    ["map_version"] = MapVersion
                },
                ["app_info"] = JsonObject(){
                    ["auto_pv"] = 0,
                    ["auto_pv_with_smsretriever"] = 1,
                    ["smartlock_supported"] = 0,
                    ["permission_runtime_grant"] = 2
                }
            }
            return Convert.ToBase64String(Encoding.UTF8.GetBytes(mapMd.ToJsonString()))
        }

        private async func LoadSessionCookiesAsync(client HttpClientEx, baseUri Uri) {
            for var i = 0;
            i < MaxSessionCookieTries;
            i++ {
                // Follow redirects to collect all cookies from the chain.
                // HttpClientEx has AllowAutoRedirect=false, so we follow manually.
                var response = await client.GetAsync(baseUri)
                var redirects = 0
                while IsRedirect(response.StatusCode) && redirects < 10 {
                    let location Uri? = response.Headers.Location
                    if location == nil {
                        break
                    }
                    let target Uri? = if location.IsAbsoluteUri {
                        location
                    } else {
                        Uri(baseUri, location)
                    }
                    response = await client.GetAsync(target)
                    redirects++
                }
                let cookies = client.CookieContainer.GetCookies(baseUri)
                if cookies.Cast[Cookie]().Any(
                    (c Cookie) -> c.Name.Equals("session-token", StringComparison.OrdinalIgnoreCase)
                ) {
                    Log(3, typeof(ProgrammaticLogin), () -> "Session token obtained after ${i + 1} tries")
                    return
                }
            }
            throw TimeoutException("Failed to obtain session-token cookie after $MaxSessionCookieTries attempts")
        }

        private async func GetFollowingRedirectsAsync(client HttpClientEx, uri Uri, baseUri Uri)(
            AuthCodeUri Uri?,
            Response HttpResponseMessage
        ) {
            let response = await client.GetAsync(uri)
            return await FollowRedirectsAsync(client, response, baseUri)
        }

        private async func SubmitFormAsync(
            client HttpClientEx,
            baseUri Uri,
            action string?,
            method string?,
            inputs Dictionary[string, string]?
        )(AuthCodeUri Uri?, Response HttpResponseMessage) {
            let requestUri = if action!!.StartsWith("http", StringComparison.OrdinalIgnoreCase) {
                Uri(action!!)
            } else {
                Uri(baseUri, action)
            }
            var response HttpResponseMessage
            if method!!.Equals("POST", StringComparison.OrdinalIgnoreCase) {
                response = await client.PostAsync(requestUri, FormUrlEncodedContent(inputs!!))
            } else {
                let query = string.Join(
                    "&",
                    inputs!!.Select(
                        (
                            kvp KeyValuePair[string, string]
                        ) -> "${Uri.EscapeDataString(kvp.Key)}=${Uri.EscapeDataString(kvp.Value)}"
                    )
                )
                response = await client.GetAsync(Uri("$requestUri?$query"))
            }
            return await FollowRedirectsAsync(client, response, baseUri)
        }

        private async func FollowRedirectsAsync(client HttpClientEx, response HttpResponseMessage, baseUri Uri)(
            AuthCodeUri Uri?,
            Response HttpResponseMessage
        ) {
            var response = response
            var redirectCount = 0
            while IsRedirect(response.StatusCode) && redirectCount < MaxRedirects {
                let location Uri? = response.Headers.Location
                if location == nil {
                    break
                }
                let absoluteUri Uri? = if location.IsAbsoluteUri {
                    location
                } else {
                    Uri(baseUri, location)
                }
                // Check if this redirect carries the authorization code
                if absoluteUri!!.Query.Contains("openid.oa2.authorization_code") || absoluteUri!!.AbsolutePath.Contains(
                    "maplanding"
                ) {
                    return (absoluteUri, response)
                }
                response = await client.GetAsync(absoluteUri)
                redirectCount++
            }
            return (nil, response)
        }

        private func IsRedirect(code HttpStatusCode) bool -> code == HttpStatusCode.MovedPermanently ||
            code == HttpStatusCode.Found ||
            code == HttpStatusCode.SeeOther ||
            code == HttpStatusCode.TemporaryRedirect ||
            code == HttpStatusCode.PermanentRedirect

        private func ParseForm(html string)(Action string?, Method string?, Inputs Dictionary[string, string]?) {
            // Find the sign-in form by name, then fall back to first POST form, then any form
            var formContent string? = nil
            var formTag string? = nil
            let patterns = []string{
                "(<form\\b[^>]*\\bname\\s*=\\s*\"signIn\"[^>]*>)([\\s\\S]*?)</form>",
                "(<form\\b[^>]*\\bmethod\\s*=\\s*\"[Pp][Oo][Ss][Tt]\"[^>]*>)([\\s\\S]*?)</form>",
                "(<form\\b[^>]*>)([\\s\\S]*?)</form>"
            }
            for pattern in patterns {
                let match = Regex.Match(html, pattern, RegexOptions.IgnoreCase)
                if match.Success {
                    formTag = match.Groups[1].Value
                    formContent = match.Groups[2].Value
                    break
                }
            }
            if formTag == nil || formContent == nil {
                return (nil, nil, nil)
            }
            // Extract action and method from the form tag
            let actionMatch = Regex.Match(formTag, "\\baction\\s*=\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase)
            let methodMatch = Regex.Match(formTag, "\\bmethod\\s*=\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase)
            let action string? = if actionMatch.Success {
                WebUtility.HtmlDecode(actionMatch.Groups[1].Value)
            } else {
                default(string?)
            }
            let method = if methodMatch.Success {
                methodMatch.Groups[1].Value.ToUpperInvariant()
            } else {
                "GET"
            }
            // Extract all input name/value pairs
            let inputs = Dictionary[string, string](StringComparer.OrdinalIgnoreCase)
            let inputMatches = Regex.Matches(formContent, "<input\\b[^>]*>", RegexOptions.IgnoreCase)
            for inputMatch Match in inputMatches {
                let nameMatch = Regex.Match(inputMatch.Value, "\\bname\\s*=\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase)
                if !nameMatch.Success {
                    continue
                }
                let valueMatch = Regex.Match(inputMatch.Value, "\\bvalue\\s*=\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase)
                let name = WebUtility.HtmlDecode(nameMatch.Groups[1].Value)
                let value = if valueMatch.Success {
                    WebUtility.HtmlDecode(valueMatch.Groups[1].Value)
                } else {
                    ""
                }
                inputs[name] = value
            }
            return (action, method, inputs)
        }

        private func GenerateEncryptedMetadata(locale ILocale?, loginUri Uri) string {
            let now = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
            let raw = GenerateMetadata(loginUri.ToString(), now)
            return MetadataEncryptor.Encrypt(raw)
        }

        private func GenerateMetadata(loginUrl string, nowUnixTimeStamp int64) string {
            let metadata = JsonObject(){
                ["start"] = nowUnixTimeStamp,
                ["interaction"] = JsonObject(){
                    ["keys"] = 0,
                    ["keyPressTimeIntervals"] = JsonArray(),
                    ["copies"] = 0,
                    ["cuts"] = 0,
                    ["pastes"] = 0,
                    ["clicks"] = 0,
                    ["touches"] = 0,
                    ["mouseClickPositions"] = JsonArray(),
                    ["keyCycles"] = JsonArray(),
                    ["mouseCycles"] = JsonArray(),
                    ["touchCycles"] = JsonArray()
                },
                ["version"] = "3.0.0",
                ["lsUbid"] = "X39-6721012-8795219:1549849158",
                ["timeZone"] = -6,
                ["scripts"] = JsonObject(){
                    ["dynamicUrls"] = JsonArray(
                        ReadOnlySpan[JsonNode?](
                            []JsonNode? {
                                "https://images-na.ssl-images-amazon.com/images/I/61HHaoAEflL._RC|11-BZEJ8lnL.js,01qkmZhGmAL.js,71qOHv6nKaL.js_.js?AUIClients/AudibleiOSMobileWhiteAuthSkin#mobile",
                                "https://images-na.ssl-images-amazon.com/images/I/21T7I7qVEeL._RC|21T1XtqIBZL.js,21WEJWRAQlL.js,31DwnWh8lFL.js,21VKEfzET-L.js,01fHQhWQYWL.js,51TfwrUQAQL.js_.js?AUIClients/AuthenticationPortalAssets#mobile",
                                "https://images-na.ssl-images-amazon.com/images/I/0173Lf6yxEL.js?AUIClients/AuthenticationPortalInlineAssets",
                                "https://images-na.ssl-images-amazon.com/images/I/211S6hvLW6L.js?AUIClients/CVFAssets",
                                "https://images-na.ssl-images-amazon.com/images/G/01/x-locale/common/login/fwcim._CB454428048_.js"
                            }
                        )
                    ),
                    ["inlineHashes"] = JsonArray(
                        ReadOnlySpan[JsonNode?](
                            []JsonNode? {
                                -1746719145,
                                1334687281,
                                -314038750,
                                1184642547,
                                -137736901,
                                318224283,
                                585973559,
                                1103694443,
                                11288800,
                                -1611905557,
                                1800521327,
                                -1171760960,
                                -898892073
                            }
                        )
                    ),
                    ["elapsed"] = 52,
                    ["dynamicUrlCount"] = 5,
                    ["inlineHashesCount"] = 13
                },
                ["plugins"] = "unknown||320-568-548-32-*-*-*",
                ["dupedPlugins"] = "unknown||320-568-548-32-*-*-*",
                ["screenInfo"] = "320-568-548-32-*-*-*",
                ["capabilities"] = JsonObject(){
                    ["js"] = JsonObject(){
                        ["audio"] = true,
                        ["geolocation"] = true,
                        ["localStorage"] = "supported",
                        ["touch"] = true,
                        ["video"] = true,
                        ["webWorker"] = true
                    },
                    ["css"] = JsonObject(){
                        ["textShadow"] = true,
                        ["textStroke"] = true,
                        ["boxShadow"] = true,
                        ["borderRadius"] = true,
                        ["borderImage"] = true,
                        ["opacity"] = true,
                        ["transform"] = true,
                        ["transition"] = true
                    },
                    ["elapsed"] = 1
                },
                ["referrer"] = "",
                ["userAgent"] = BrowserUserAgent,
                ["location"] = loginUrl,
                ["webDriver"] = nil,
                ["history"] = JsonObject(){["length"] = 1},
                ["gpu"] = JsonObject(){
                    ["vendor"] = "Apple Inc.",
                    ["model"] = "Apple A9 GPU",
                    ["extensions"] = JsonArray()
                },
                ["math"] = JsonObject(){
                    ["tan"] = "-1.4214488238747243",
                    ["sin"] = "0.8178819121159085",
                    ["cos"] = "-0.5753861119575491"
                },
                ["performance"] = JsonObject(){
                    ["timing"] = JsonObject(){
                        ["navigationStart"] = nowUnixTimeStamp,
                        ["unloadEventStart"] = 0,
                        ["unloadEventEnd"] = 0,
                        ["redirectStart"] = 0,
                        ["redirectEnd"] = 0,
                        ["fetchStart"] = nowUnixTimeStamp,
                        ["domainLookupStart"] = nowUnixTimeStamp,
                        ["domainLookupEnd"] = nowUnixTimeStamp,
                        ["connectStart"] = nowUnixTimeStamp,
                        ["connectEnd"] = nowUnixTimeStamp,
                        ["secureConnectionStart"] = nowUnixTimeStamp,
                        ["requestStart"] = nowUnixTimeStamp,
                        ["responseStart"] = nowUnixTimeStamp,
                        ["responseEnd"] = nowUnixTimeStamp,
                        ["domLoading"] = nowUnixTimeStamp,
                        ["domInteractive"] = nowUnixTimeStamp,
                        ["domContentLoadedEventStart"] = nowUnixTimeStamp,
                        ["domContentLoadedEventEnd"] = nowUnixTimeStamp,
                        ["domComplete"] = nowUnixTimeStamp,
                        ["loadEventStart"] = nowUnixTimeStamp,
                        ["loadEventEnd"] = nowUnixTimeStamp
                    }
                },
                ["end"] = nowUnixTimeStamp,
                ["timeToSubmit"] = 108873,
                ["form"] = JsonObject(){
                    ["email"] = JsonObject(){
                        ["keys"] = 0,
                        ["keyPressTimeIntervals"] = JsonArray(),
                        ["copies"] = 0,
                        ["cuts"] = 0,
                        ["pastes"] = 0,
                        ["clicks"] = 0,
                        ["touches"] = 0,
                        ["mouseClickPositions"] = JsonArray(),
                        ["keyCycles"] = JsonArray(),
                        ["mouseCycles"] = JsonArray(),
                        ["touchCycles"] = JsonArray(),
                        ["width"] = 290,
                        ["height"] = 43,
                        ["checksum"] = "C860E86B",
                        ["time"] = 12773,
                        ["autocomplete"] = false,
                        ["prefilled"] = false
                    },
                    ["password"] = JsonObject(){
                        ["keys"] = 0,
                        ["keyPressTimeIntervals"] = JsonArray(),
                        ["copies"] = 0,
                        ["cuts"] = 0,
                        ["pastes"] = 0,
                        ["clicks"] = 0,
                        ["touches"] = 0,
                        ["mouseClickPositions"] = JsonArray(),
                        ["keyCycles"] = JsonArray(),
                        ["mouseCycles"] = JsonArray(),
                        ["touchCycles"] = JsonArray(),
                        ["width"] = 290,
                        ["height"] = 43,
                        ["time"] = 10353,
                        ["autocomplete"] = false,
                        ["prefilled"] = false
                    }
                },
                ["canvas"] = JsonObject(){
                    ["hash"] = -373378155,
                    ["emailHash"] = -1447130560,
                    ["histogramBins"] = JsonArray()
                },
                ["token"] = nil,
                ["errors"] = JsonArray(),
                ["metrics"] = JsonArray(
                    ReadOnlySpan[JsonNode?](
                        []JsonNode? {
                            JsonObject(){["n"] = "fwcim-mercury-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-instant-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-element-telemetry-collector", ["t"] = 2},
                            JsonObject(){["n"] = "fwcim-script-version-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-local-storage-identifier-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-timezone-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-script-collector", ["t"] = 1},
                            JsonObject(){["n"] = "fwcim-plugin-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-capability-collector", ["t"] = 1},
                            JsonObject(){["n"] = "fwcim-browser-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-history-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-gpu-collector", ["t"] = 1},
                            JsonObject(){["n"] = "fwcim-battery-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-dnt-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-math-fingerprint-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-performance-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-timer-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-time-to-submit-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-form-input-telemetry-collector", ["t"] = 4},
                            JsonObject(){["n"] = "fwcim-canvas-collector", ["t"] = 2},
                            JsonObject(){["n"] = "fwcim-captcha-telemetry-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-proof-of-work-collector", ["t"] = 1},
                            JsonObject(){["n"] = "fwcim-ubf-collector", ["t"] = 0},
                            JsonObject(){["n"] = "fwcim-timer-collector", ["t"] = 0}
                        }
                    )
                )
            }
            return metadata.ToJsonString()
        }
    }
}
