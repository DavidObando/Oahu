package Oahu.Core.Ex

import Oahu.Aux
import Oahu.Aux.Logging
import Oahu.Core
import System
import System.IO
import System.Net
import System.Net.Http
import System.Net.Http.Headers
import System.Runtime.CompilerServices
import System.Threading.Tasks

class LoggingExtensions {
    shared {
        const BEFORE string = "Before request, "
        const AFTER string = "After request,  "

        func WriteHtml(result string, credentials Credentials?) string? {
            let anonResult string? = result.AnonymizeCredentials(credentials)
            let file string? = anonResult.WriteTempHtmlFile()
            return file
        }
    }
}

async func (request HttpRequestMessage) LogAsync(
    level uint32,
    caller Type,
    requestHeaders HttpRequestHeaders? = nil,
    cookieContainer CookieContainer? = nil,
    baseUri Uri? = nil,
    credentials Credentials? = nil,
    @CallerMemberName method string? = nil
) {
    var uri Uri? = request.RequestUri
    if !uri!!.IsAbsoluteUri && (baseUri?.IsAbsoluteUri ?? false) {
        uri = Uri(baseUri!!, request.RequestUri!!)
    }
    Log(level, caller, () -> "${LoggingExtensions.BEFORE}${request.Method}, $uri", method)
    if !requestHeaders.IsNullOrEmpty() {
        Log(level, caller, () -> "${LoggingExtensions.BEFORE}default ${requestHeaders.HeadersToString()}", method)
    }
    if !request.Headers.IsNullOrEmpty() {
        Log(level, caller, () -> "${LoggingExtensions.BEFORE}${request.HeadersToString()}", method)
    }
    if cookieContainer != nil && cookieContainer.Count > 0 && baseUri != nil {
        Log(level, caller, () -> "${LoggingExtensions.BEFORE}${cookieContainer?.CookiesToString(baseUri)}", method)
    }
    if int64(Logging.Level) >= int64(level) && request.Content is FormUrlEncodedContent {
        let reqContentString string? = await request.ContentToStringAsync(credentials)
        Log(level, caller, () -> "${LoggingExtensions.BEFORE}$reqContentString", method)
    }
}

async func (request HttpRequestMessage) LogAsync(
    level uint32,
    caller object,
    requestHeaders HttpRequestHeaders? = nil,
    cookieContainer CookieContainer? = nil,
    baseUri Uri? = nil,
    credentials Credentials? = nil,
    @CallerMemberName method string? = nil
) -> await request.LogAsync(level, caller.GetType(), requestHeaders, cookieContainer, baseUri, credentials, method)

async func (request HttpRequestMessage) LogAsync(
    level uint32,
    caller Type,
    requestHeaders HttpRequestHeaders?,
    cookieContainer CookieContainer?,
    baseUriString string?,
    credentials Credentials?,
    @CallerMemberName method string? = nil
) -> await request.LogAsync(level, caller, requestHeaders, cookieContainer, Uri(baseUriString!!), credentials, method)

async func (request HttpRequestMessage) LogAsync(
    level uint32,
    caller object,
    requestHeaders HttpRequestHeaders?,
    cookieContainer CookieContainer?,
    baseUriString string?,
    credentials Credentials?,
    @CallerMemberName method string? = nil
) -> await request.LogAsync(
    level,
    caller.GetType(),
    requestHeaders,
    cookieContainer,
    Uri(baseUriString!!),
    credentials,
    method
)

async func (request HttpRequestMessage) LogAsync(
    level uint32,
    caller Type,
    requestHeaders HttpRequestHeaders,
    cookieContainer CookieContainer,
    credentials CredentialsUrl,
    @CallerMemberName method string? = nil
) -> await request.LogAsync(
    level,
    caller,
    requestHeaders,
    cookieContainer,
    Uri(credentials.BaseUriString),
    credentials,
    method
)

async func (request HttpRequestMessage) LogAsync(
    level uint32,
    caller object,
    requestHeaders HttpRequestHeaders,
    cookieContainer CookieContainer,
    credentials CredentialsUrl,
    @CallerMemberName method string? = nil
) -> await request
    .LogAsync(
    level,
    caller.GetType(),
    requestHeaders,
    cookieContainer,
    Uri(credentials.BaseUriString),
    credentials,
    method
)

async func (response HttpResponseMessage?) LogAsync(
    level uint32,
    caller Type,
    cookieContainer CookieContainer? = nil,
    baseUri Uri? = nil,
    credentials Credentials? = nil,
    @CallerMemberName method string? = nil
) {
    var uri Uri? = response?.RequestMessage?.RequestUri
    if uri != nil && !uri.IsAbsoluteUri && (baseUri?.IsAbsoluteUri ?? false) {
        uri = Uri(baseUri!!, uri)
    }
    Log(
        level,
        caller,
        () -> (
            "${LoggingExtensions.AFTER}${response!!.RequestMessage!!.Method}, status=${response!!.StatusCode}," +
                " requestUri=$uri"
        ),
        method
    )
    Log(level, caller, () -> "${LoggingExtensions.AFTER}${response.HeadersToString()}", method)
    if cookieContainer != nil && cookieContainer.Count > 0 && baseUri != nil {
        Log(level, caller, () -> "${LoggingExtensions.AFTER}${cookieContainer?.CookiesToString(baseUri)}", method)
    }
    // if (Logging.Level >= level && response.IsSuccessStatusCode) {
    // anyway
    if int64(Logging.Level) >= int64(level) {
        try {
            let content = response!!.Content
            let result = await content.ReadAsStringAsync()
            let file string? = LoggingExtensions.WriteHtml(result, credentials)
            if file != nil {
                Log(
                    level,
                    caller,
                    () -> "${LoggingExtensions.AFTER}response content written to \"${Path.GetFileName(file)}\"",
                    method
                )
            }
        } catch (Exception) { }
    }
}

async func (response HttpResponseMessage?) LogAsync(
    level uint32,
    caller object,
    cookieContainer CookieContainer? = nil,
    baseUri Uri? = nil,
    credentials Credentials? = nil,
    @CallerMemberName method string? = nil
) -> await response.LogAsync(level, caller.GetType(), cookieContainer, baseUri, credentials, method)

async func (response HttpResponseMessage) LogAsync(
    level uint32,
    caller Type,
    cookieContainer CookieContainer,
    baseUriString string,
    credentials Credentials? = nil,
    @CallerMemberName method string? = nil
) -> await response.LogAsync(level, caller, cookieContainer, Uri(baseUriString), credentials, method)

async func (response HttpResponseMessage) LogAsync(
    level uint32,
    caller object,
    cookieContainer CookieContainer,
    baseUriString string,
    credentials Credentials? = nil,
    @CallerMemberName method string? = nil
) -> await response.LogAsync(level, caller.GetType(), cookieContainer, Uri(baseUriString), credentials, method)

async func (response HttpResponseMessage) LogAsync(
    level uint32,
    caller Type,
    cookieContainer CookieContainer,
    credentials CredentialsUrl,
    @CallerMemberName method string? = nil
) -> await response.LogAsync(
    level,
    caller.GetType(),
    cookieContainer,
    Uri(credentials.BaseUriString),
    credentials,
    method
)

async func (response HttpResponseMessage) LogAsync(
    level uint32,
    caller object,
    cookieContainer CookieContainer,
    credentials CredentialsUrl,
    @CallerMemberName method string? = nil
) -> await response.LogAsync(
    level,
    caller.GetType(),
    cookieContainer,
    Uri(credentials.BaseUriString),
    credentials,
    method
)
