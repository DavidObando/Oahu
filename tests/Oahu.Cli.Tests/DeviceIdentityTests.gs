package Oahu.Cli.Tests

import Oahu.Audible.Json
import Oahu.CommonTypes
import System
import System.Reflection
import System.Text
import System.Web
import Xunit

/// The device identity is split across the OAuth sign-in URL and the registration payload, and
/// the two must agree — the device type is baked into the OAuth client id, so a half-applied
/// change registers a client Audible will not grant licenses to. As of 2026-09-02 the emulated
/// Audible-for-Android client is refused outright, so these assertions pin the iPhone identity.
class DeviceIdentityTests {
    @Fact
    func RegistersAsIphoneDeviceType() {
        Assert.Equal("A2CZJZGLK2JJVM", DeviceType())
    }

    @Fact
    func AuthUriUsesIosSigninSurface() {
        let uri = BuildAuthUri(preAmazonUsername: false)
        let q = HttpUtility.ParseQueryString(uri.Query)
        Assert.Equal("www.amazon.com", uri.Host)
        Assert.Equal("amzn_audible_ios", q["pageId"])
        Assert.Equal("amzn_audible_ios_us", q["openid.assoc_handle"])
        Assert.Equal("https://www.amazon.com/ap/maplanding", q["openid.return_to"])
        Assert.Equal("true", q["forceMobileLayout"])
    }

    /// The OAuth client id is "device:" + hex(serial + "#" + deviceType). If it stops carrying the
    /// iPhone device type, registration silently produces the old client again.
    @Fact
    func AuthUriClientIdCarriesTheDeviceType() {
        let q = HttpUtility.ParseQueryString(BuildAuthUri(preAmazonUsername: false).Query)
        let clientId = q["openid.oa2.client_id"]!!
        Assert.StartsWith("device:", clientId)
        let hex = clientId.Substring("device:".Length)
        let raw = Convert.FromHexString(hex)
        let decoded = Encoding.UTF8.GetString(raw)
        Assert.EndsWith("#" + DeviceType(), decoded)
    }

    @Fact
    func PreAmazonUsernameFlowAlsoUsesIosSurface() {
        let q = HttpUtility.ParseQueryString(BuildAuthUri(preAmazonUsername: true).Query)
        Assert.Equal("amzn_audible_ios_privatepool", q["pageId"])
        Assert.Equal("amzn_audible_ios_lap_us", q["openid.assoc_handle"])
        Assert.Equal("https://www.audible.com/ap/maplanding", q["openid.return_to"])
    }

    shared {
        private func BuildAuthUri(preAmazonUsername bool) Uri {
            let loginType = typeof(ContentLicense).Assembly.GetType("Oahu.Core.AudibleLogin", throwOnError: true)!!
            let login = Activator.CreateInstance(loginType, nonPublic: true)!!
            let build = loginType.GetMethod("BuildAuthUri", BindingFlags.Public | BindingFlags.Instance)!!
            return cast[Uri](build.Invoke(login, []object{ERegion.Us, preAmazonUsername})!!)
        }

        private func DeviceType() string {
            let loginType = typeof(ContentLicense).Assembly.GetType("Oahu.Core.AudibleLogin", throwOnError: true)!!
            return cast[string](
                loginType.GetField("DeviceType", BindingFlags.Public | BindingFlags.Static)!!.GetRawConstantValue()!!
            )
        }
    }
}
