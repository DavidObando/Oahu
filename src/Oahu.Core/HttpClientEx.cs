using System;
using System.Net;
using System.Net.Http;

namespace Oahu.Core
{
  class HttpClientEx : HttpClient
  {
    private HttpClientEx(HttpMessageHandler handler) : base(handler)
    {
    }

    public CookieContainer CookieContainer { get; } = new CookieContainer();

    public static HttpClientEx Create(Uri baseUri)
    {
      var handler = new HttpClientHandler
      {
        AllowAutoRedirect = false,
        AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate
      };
      return Create(handler, baseUri);
    }

    private static HttpClientEx Create(HttpClientHandler handler, Uri baseUri)
    {
      var client = new HttpClientEx(handler);
      client.BaseAddress = baseUri;

      handler.AllowAutoRedirect = false;
      handler.CookieContainer = client.CookieContainer;

      return client;
    }
  }
}
