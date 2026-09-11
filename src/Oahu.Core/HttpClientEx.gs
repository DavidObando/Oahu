package Oahu.Core

import System
import System.Net
import System.Net.Http

internal class HttpClientEx : HttpClient {
    private init(handler HttpMessageHandler) : base(handler) {
        CookieContainer = CookieContainer()
    }

    prop CookieContainer CookieContainer {
        get;
        init;
    }

    shared {
        func Create(baseUri Uri) HttpClientEx {
            let handler = HttpClientHandler{
                AllowAutoRedirect: false,
                AutomaticDecompression: DecompressionMethods.GZip | DecompressionMethods.Deflate
            }
            return Create(handler, baseUri)
        }

        private func Create(handler HttpClientHandler, baseUri Uri) HttpClientEx {
            let client = HttpClientEx(handler)
            client.BaseAddress = baseUri
            handler.AllowAutoRedirect = false
            handler.CookieContainer = client.CookieContainer
            return client
        }
    }
}
