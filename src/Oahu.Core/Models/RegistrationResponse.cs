using System.Text.Json.Serialization;

namespace Oahu.Audible.Json
{
  public class RegistrationResponse : Serialization<RegistrationResponse>
  {
    [JsonPropertyName("response")]
    public Response Response { get; set; }

    [JsonPropertyName("request_id")]
    public string RequestId { get; set; }
  }

  public class Response
  {
    [JsonPropertyName("success")]
    public Success Success { get; set; }
  }

  public class Success
  {
    [JsonPropertyName("extensions")]
    public Extensions Extensions { get; set; }

    [JsonPropertyName("tokens")]
    public Tokens Tokens { get; set; }

    [JsonPropertyName("customer_id")]
    public string CustomerId { get; set; }
  }

  public class Extensions
  {
    [JsonPropertyName("device_info")]
    public DeviceInfoJson DeviceInfoJson { get; set; }

    [JsonPropertyName("customer_info")]
    public CustomerInfoJson CustomerInfoJson { get; set; }
  }

  public class DeviceInfoJson
  {
    [JsonPropertyName("device_name")]
    public string DeviceName { get; set; }

    [JsonPropertyName("device_serial_number")]
    public string DeviceSerialNumber { get; set; }

    [JsonPropertyName("device_type")]
    public string DeviceType { get; set; }
  }

  public class CustomerInfoJson
  {
    [JsonPropertyName("account_pool")]
    public string AccountPool { get; set; }

    [JsonPropertyName("user_id")]
    public string UserId { get; set; }

    [JsonPropertyName("home_region")]
    public string HomeRegion { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }

    [JsonPropertyName("given_name")]
    public string GivenName { get; set; }
  }

  public class Tokens
  {
    [JsonPropertyName("website_cookies")]
    public WebsiteCookies[] WebsiteCookies { get; set; }

    [JsonPropertyName("store_authentication_cookie")]
    public StoreAuthenticationCookie StoreAuthenticationCookie { get; set; }

    [JsonPropertyName("mac_dms")]
    public MacDms MacDms { get; set; }

    [JsonPropertyName("bearer")]
    public Bearer Bearer { get; set; }
  }

  public class StoreAuthenticationCookie
  {
    [JsonPropertyName("cookie")]
    public string Cookie { get; set; }
  }

  public class MacDms
  {
    [JsonPropertyName("device_private_key")]
    public string DevicePrivateKey { get; set; }

    [JsonPropertyName("adp_token")]
    public string AdpToken { get; set; }
  }

  public class Bearer
  {
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; }

    [JsonPropertyName("refresh_token")]
    public string RefreshToken { get; set; }

    [JsonPropertyName("expires_in")]
    public string ExpiresIn { get; set; }
  }

  public class WebsiteCookies
  {
    public string Path { get; set; }

    public string Secure { get; set; }

    public string Value { get; set; }

    public string Expires { get; set; }

    public string Domain { get; set; }

    public string HttpOnly { get; set; }

    public string Name { get; set; }
  }
}
