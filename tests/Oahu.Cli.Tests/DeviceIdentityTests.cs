using System;
using System.Reflection;
using System.Web;
using Oahu.CommonTypes;
using Xunit;

namespace Oahu.Cli.Tests
{
  /// <summary>
  /// The device identity is split across the OAuth sign-in URL and the registration payload, and
  /// the two must agree — the device type is baked into the OAuth client id, so a half-applied
  /// change registers a client Audible will not grant licenses to. As of 2026-09-02 the emulated
  /// Audible-for-Android client is refused outright, so these assertions pin the iPhone identity.
  /// </summary>
  public class DeviceIdentityTests
  {
    private static Uri BuildAuthUri(bool preAmazonUsername)
    {
      Type loginType = typeof(Oahu.Audible.Json.ContentLicense).Assembly
        .GetType("Oahu.Core.AudibleLogin", throwOnError: true)!;

      object login = Activator.CreateInstance(loginType, nonPublic: true)!;

      MethodInfo build = loginType.GetMethod("BuildAuthUri", BindingFlags.Public | BindingFlags.Instance)!;

      return (Uri)build.Invoke(login, new object[] { ERegion.Us, preAmazonUsername })!;
    }

    private static string DeviceType()
    {
      Type loginType = typeof(Oahu.Audible.Json.ContentLicense).Assembly
        .GetType("Oahu.Core.AudibleLogin", throwOnError: true)!;

      return (string)loginType.GetField("DeviceType", BindingFlags.Public | BindingFlags.Static)!
        .GetRawConstantValue()!;
    }

    [Fact]
    public void RegistersAsIphoneDeviceType()
    {
      Assert.Equal("A2CZJZGLK2JJVM", DeviceType());
    }

    [Fact]
    public void AuthUriUsesIosSigninSurface()
    {
      var uri = BuildAuthUri(preAmazonUsername: false);
      var q = HttpUtility.ParseQueryString(uri.Query);

      Assert.Equal("www.amazon.com", uri.Host);
      Assert.Equal("amzn_audible_ios", q["pageId"]);
      Assert.Equal("amzn_audible_ios_us", q["openid.assoc_handle"]);
      Assert.Equal("https://www.amazon.com/ap/maplanding", q["openid.return_to"]);
      Assert.Equal("true", q["forceMobileLayout"]);
    }

    /// <summary>
    /// The OAuth client id is "device:" + hex(serial + "#" + deviceType). If it stops carrying the
    /// iPhone device type, registration silently produces the old client again.
    /// </summary>
    [Fact]
    public void AuthUriClientIdCarriesTheDeviceType()
    {
      var q = HttpUtility.ParseQueryString(BuildAuthUri(preAmazonUsername: false).Query);
      string clientId = q["openid.oa2.client_id"]!;

      Assert.StartsWith("device:", clientId);

      string hex = clientId.Substring("device:".Length);
      byte[] raw = Convert.FromHexString(hex);
      string decoded = System.Text.Encoding.UTF8.GetString(raw);

      Assert.EndsWith("#" + DeviceType(), decoded);
    }

    [Fact]
    public void PreAmazonUsernameFlowAlsoUsesIosSurface()
    {
      var q = HttpUtility.ParseQueryString(BuildAuthUri(preAmazonUsername: true).Query);

      Assert.Equal("amzn_audible_ios_privatepool", q["pageId"]);
      Assert.Equal("amzn_audible_ios_lap_us", q["openid.assoc_handle"]);
      Assert.Equal("https://www.audible.com/ap/maplanding", q["openid.return_to"]);
    }
  }
}
