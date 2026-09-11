package Oahu.Audible.Json

import System.Text.Json.Serialization

class RegistrationResponse : Serialization[RegistrationResponse] {
    @JsonPropertyName("response")
    prop Response Response

    @JsonPropertyName("request_id")
    prop RequestId string
}

class Response {
    @JsonPropertyName("success")
    prop Success Success
}

class Success {
    @JsonPropertyName("extensions")
    prop Extensions Extensions

    @JsonPropertyName("tokens")
    prop Tokens Tokens

    @JsonPropertyName("customer_id")
    prop CustomerId string
}

class Extensions {
    @JsonPropertyName("device_info")
    prop DeviceInfoJson DeviceInfoJson

    @JsonPropertyName("customer_info")
    prop CustomerInfoJson CustomerInfoJson
}

class DeviceInfoJson {
    @JsonPropertyName("device_name")
    prop DeviceName string

    @JsonPropertyName("device_serial_number")
    prop DeviceSerialNumber string

    @JsonPropertyName("device_type")
    prop DeviceType string
}

class CustomerInfoJson {
    @JsonPropertyName("account_pool")
    prop AccountPool string

    @JsonPropertyName("user_id")
    prop UserId string

    @JsonPropertyName("home_region")
    prop HomeRegion string

    @JsonPropertyName("name")
    prop Name string

    @JsonPropertyName("given_name")
    prop GivenName string
}

class Tokens {
    @JsonPropertyName("website_cookies")
    prop WebsiteCookies[]WebsiteCookies

    @JsonPropertyName("store_authentication_cookie")
    prop StoreAuthenticationCookie StoreAuthenticationCookie

    @JsonPropertyName("mac_dms")
    prop MacDms MacDms

    @JsonPropertyName("bearer")
    prop Bearer Bearer
}

class StoreAuthenticationCookie {
    @JsonPropertyName("cookie")
    prop Cookie string
}

class MacDms {
    @JsonPropertyName("device_private_key")
    prop DevicePrivateKey string

    @JsonPropertyName("adp_token")
    prop AdpToken string
}

class Bearer {
    @JsonPropertyName("access_token")
    prop AccessToken string

    @JsonPropertyName("refresh_token")
    prop RefreshToken string

    @JsonPropertyName("expires_in")
    prop ExpiresIn string
}

class WebsiteCookies {
    prop Path string
    prop Secure string
    prop Value string
    prop Expires string
    prop Domain string
    prop HttpOnly string
    prop Name string
}
