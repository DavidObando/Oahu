package Oahu.Core

import Oahu.Aux.Extensions
import Oahu.Aux.Logging
import Oahu.CommonTypes
import Oahu.Core.Ex
import System
import System.Collections.Generic
import System.Linq
import System.Security.Cryptography
import System.Text

internal class AudibleLogin {
    prop Region ERegion {
        get;
        private set;
    }

    prop WithPreAmazonUsername bool {
        get;
        private set;
    }

    prop CodeVerifierB64 string {
        get;
        private set;
    }

    prop CodeChallengeB64 string {
        get;
        private set;
    }

    prop Serial string {
        get;
        private set;
    }

    prop ClientId string {
        get;
        private set;
    }

    func BuildAuthUri(region ERegion, withPreAmazonUsername bool) Uri {
        Log(3, this, () -> "reg=$region, preAmznAccnt=$withPreAmazonUsername")
        Region = region
        let locale ILocale? = region.FromCountryCode()
        WithPreAmazonUsername = withPreAmazonUsername
        if withPreAmazonUsername && !([]ERegion{ERegion.De, ERegion.Uk, ERegion.Us}.Contains(locale!!.CountryCode)) {
            throw ArgumentException("Login with username is only supported for DE, US and UK marketplaces!")
        }
        Serial = BuildDeviceSerial()
        ClientId = BuildClientId(Serial)
        CodeVerifierB64 = CreateCodeVerifier()
        CodeChallengeB64 = CreateSHA256CodeChallenge(CodeVerifierB64)
        // Sign-in and return_to both live on amazon.{TLD} for the iPhone client; the Android client
        // used audible.{TLD}. The device type is baked into the OAuth client id, so these have to
        // move together with AudibleLogin.DeviceType.
        var return_to = "https://www.amazon.${locale!!.Domain}/ap/maplanding"
        let cc = locale!!.CountryCode.ToString().ToLowerInvariant()
        var base_url string
        var assoc_handle string
        var page_id string
        if withPreAmazonUsername {
            base_url = "https://www.audible.${locale!!.Domain}/ap/signin"
            return_to = "https://www.audible.${locale!!.Domain}/ap/maplanding"
            assoc_handle = "amzn_audible_ios_lap_$cc"
            page_id = "amzn_audible_ios_privatepool"
        } else {
            base_url = "https://www.amazon.${locale!!.Domain}/ap/signin"
            assoc_handle = "amzn_audible_ios_$cc"
            page_id = "amzn_audible_ios"
        }
        let oauthParams = List[KeyValuePair[string, string]]{
            KeyValuePair[string, string]("openid.pape.max_auth_age", "0"),
            KeyValuePair[string, string]("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select"),
            KeyValuePair[string, string]("accountStatusPolicy", "P1"),
            KeyValuePair[string, string]("marketPlaceId", locale!!.MarketPlaceId),
            KeyValuePair[string, string]("pageId", page_id),
            KeyValuePair[string, string]("openid.return_to", return_to),
            KeyValuePair[string, string]("openid.assoc_handle", assoc_handle),
            KeyValuePair[string, string]("openid.oa2.response_type", "code"),
            KeyValuePair[string, string]("openid.mode", "checkid_setup"),
            KeyValuePair[string, string]("openid.ns.pape", "http://specs.openid.net/extensions/pape/1.0"),
            KeyValuePair[string, string]("openid.oa2.code_challenge_method", "S256"),
            KeyValuePair[string, string]("openid.ns.oa2", "http://www.amazon.com/ap/ext/oauth/2"),
            KeyValuePair[string, string]("openid.oa2.code_challenge", CodeChallengeB64),
            KeyValuePair[string, string]("openid.oa2.scope", "device_auth_access"),
            KeyValuePair[string, string]("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select"),
            KeyValuePair[string, string]("openid.oa2.client_id", "device:$ClientId"),
            KeyValuePair[string, string]("disableLoginPrepopulate", "1"),
            KeyValuePair[string, string]("forceMobileLayout", "true"),
            KeyValuePair[string, string]("openid.ns", "http://specs.openid.net/auth/2.0")
        }
        return Uri("$base_url?${oauthParams.ToQueryString()}")
    }

    func ParseExternalResponse(uri Uri?) Profile? {
        let authorization Authorization? = Authorization.Create(uri)
        if authorization == nil {
            return nil
        }
        authorization.CodeVerifier = CodeVerifierB64
        return Profile(Region, authorization, Serial, WithPreAmazonUsername)
    }

    shared {
        const DeviceType string = "A2CZJZGLK2JJVM"

        // internal instead of private for testing only
        internal func BuildDeviceSerial() string {
            let serialBytes = [20]uint8
            Random.Shared.NextBytes(serialBytes)
            let serial = Convert.ToHexString(serialBytes).ToLower()
            Log(3, typeof(AudibleLogin), () -> serial)
            return serial
        }

        // internal instead of private for testing only
        internal func BuildClientId(serial string?) string {
            let serialEx = "$serial#$DeviceType"
            let clientId = Encoding.UTF8.GetBytes(serialEx)
            let clientIdHex = Convert.ToHexString(clientId).ToLower()
            Log(3, typeof(AudibleLogin), () -> clientIdHex)
            return clientIdHex
        }

        // internal instead of private for testing only
        internal func CreateCodeVerifier() string {
            let tokenBytes = [32]uint8
            Random.Shared.NextBytes(tokenBytes)
            let codeVerifier = tokenBytes.ToUrlBase64String()
            return codeVerifier
        }

        // internal instead of private for testing only
        internal func CreateSHA256CodeChallenge(codeVerifier string) string {
            let sha256 = SHA256.Create()
            let tokenBytes = codeVerifier.GetBytes()
            let hash = sha256.ComputeHash(tokenBytes)
            return hash.ToUrlBase64String()
        }
    }
}
