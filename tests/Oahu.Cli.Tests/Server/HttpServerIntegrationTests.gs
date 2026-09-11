package Oahu.Cli.Tests.Server

import System
import System.IO
import System.Linq
import System.Net.Http
import System.Net.Http.Headers
import System.Threading.Tasks
import Microsoft.AspNetCore.Builder
import Microsoft.AspNetCore.Hosting.Server
import Microsoft.AspNetCore.Hosting.Server.Features
import Microsoft.Extensions.DependencyInjection
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Server.Auth
import Oahu.Cli.Server.Hosting
import Xunit
import System.Net
import System.Text

/// Boots the real ASP.NET Core HTTP server on an ephemeral loopback port, hits it
/// with HttpClient, and asserts wire-level shape + bearer-token enforcement.
class HttpServerIntegrationTests {
    @Fact
    async func Missing_Token_Returns_401() {
        let (options, factories, _, tokenPath) = Build()
        let app = ServerHost.BuildHttpApp(options, factories)
        await app.StartAsync()
        try {
            using let c = HttpClient{BaseAddress: Uri(ResolveBaseUrl(app))}
            let resp = await c.GetAsync("/v1/library")
            Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode)
        } finally {
            await app.StopAsync()
            await app.DisposeAsync()
            File.Delete(tokenPath)
        }
    }

    @Fact
    async func With_Token_Library_Endpoint_Returns_Items() {
        let (options, factories, token, tokenPath) = Build()
        let app = ServerHost.BuildHttpApp(options, factories)
        await app.StartAsync()
        try {
            using let c = HttpClient{BaseAddress: Uri(ResolveBaseUrl(app))}
            c.DefaultRequestHeaders.Authorization = AuthenticationHeaderValue("Bearer", token)
            let resp = await c.GetAsync("/v1/library")
            resp.EnsureSuccessStatusCode()
            let json = await resp.Content.ReadAsStringAsync()
            Assert.Contains("Foundation", json)
            Assert.Contains("Dune", json)
            Assert.Contains("\"total\":2", json)
        } finally {
            await app.StopAsync()
            await app.DisposeAsync()
            File.Delete(tokenPath)
        }
    }

    @Fact
    async func Queue_Add_Then_List_Then_Clear_Requires_Confirm() {
        let (options, factories, token, tokenPath) = Build()
        let app = ServerHost.BuildHttpApp(options, factories)
        await app.StartAsync()
        try {
            using let c = HttpClient{BaseAddress: Uri(ResolveBaseUrl(app))}
            c.DefaultRequestHeaders.Authorization = AuthenticationHeaderValue("Bearer", token)
            using let addBody = StringContent("{\"asins\":[\"B1\",\"B2\"]}", Encoding.UTF8, "application/json")
            let addResp = await c.PostAsync("/v1/queue", addBody)
            addResp.EnsureSuccessStatusCode()
            let listJson = await c.GetStringAsync("/v1/queue")
            Assert.Contains("\"total\":2", listJson)
            // Clear without confirm: should fail (Destructive denied).
            let clearNoConfirm = await c.DeleteAsync("/v1/queue")
            Assert.False(clearNoConfirm.IsSuccessStatusCode)
            // Clear with confirm.
            let clearOk = await c.DeleteAsync("/v1/queue?confirm=true")
            clearOk.EnsureSuccessStatusCode()
            let afterJson = await c.GetStringAsync("/v1/queue")
            Assert.Contains("\"total\":0", afterJson)
        } finally {
            await app.StopAsync()
            await app.DisposeAsync()
            File.Delete(tokenPath)
        }
    }

    @Fact
    func Non_Loopback_Bind_Refused() {
        let (options, factories, _, tokenPath) = Build()
        try {
            let bad = ServerOptions{
                EnableHttp: true,
                HttpHost: "0.0.0.0",
                HttpPort: 0,
                TokenPath: options.TokenPath,
                AuditPath: options.AuditPath
            }
            Assert.Throws[InvalidOperationException](
                func () object? {
                    return ServerHost.BuildHttpApp(bad, factories)
                }
            )
        } finally {
            File.Delete(tokenPath)
        }
    }

    shared {
        private func Build()(
            options ServerOptions,
            factories ServerHost.ServiceFactories,
            token string,
            tokenPath string
        ) {
            let tokenPath = Path.Combine(Path.GetTempPath(), "oahu-http-token-${Guid.NewGuid():n}")
            let auditPath = Path.Combine(Path.GetTempPath(), "oahu-http-audit-${Guid.NewGuid():n}.jsonl")
            let token = TokenStore(tokenPath).ReadOrCreate()
            let lib = FakeLibraryService(
                []LibraryItem{LibraryItem{Asin: "B1", Title: "Foundation"}, LibraryItem{Asin: "B2", Title: "Dune"}}
            )
            let queue = InMemoryQueueService()
            let auth = FakeAuthService()
            let jobs = JobScheduler(FakeJobExecutor())
            let configPath = Path.Combine(Path.GetTempPath(), "oahu-http-cfg-${Guid.NewGuid():n}.json")
            let cfg = JsonConfigService(configPath)
            let doctor = DoctorService()
            let options = ServerOptions{
                EnableHttp: true,
                HttpHost: "127.0.0.1",
                HttpPort: 0,
                TokenPath: tokenPath,
                AuditPath: auditPath
            }
            let factories = ServerHost.ServiceFactories{
                Auth: () -> auth,
                Library: () -> lib,
                Queue: () -> queue,
                Job: () -> jobs,
                Config: () -> cfg,
                Doctor: () -> doctor
            }
            return (options, factories, token, tokenPath)
        }

        private func ResolveBaseUrl(app WebApplication) string {
            // Kestrel exposes the actual ephemeral port via IServerAddressesFeature
            // once StartAsync has bound the socket. Fall back to app.Urls otherwise.
            let server = app.Services.GetRequiredService[IServer]()
            let addrs = server.Features.Get[IServerAddressesFeature]()
            let url = addrs?.Addresses.FirstOrDefault() ?? app.Urls.FirstOrDefault()
            Assert.False(string.IsNullOrEmpty(url), "Server did not report a bound URL.")
            return url!!
        }
    }
}
