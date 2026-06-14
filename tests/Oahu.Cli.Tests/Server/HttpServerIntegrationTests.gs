// G# port of Server/HttpServerIntegrationTests.cs
// NOTE: Tuple return of 4 elements triggers GS9998; using field-based setup instead.

package Oahu.Cli.Tests.Server

import System
import System.IO
import System.Linq
import System.Net
import System.Net.Http
import System.Net.Http.Headers
import System.Text
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

class HttpServerIntegrationTests {

    func buildOptions() ServerOptions {
        var tokenPath = Path.Combine(Path.GetTempPath(), "oahu-http-token-" + Guid.NewGuid().ToString("N"))
        var auditPath = Path.Combine(Path.GetTempPath(), "oahu-http-audit-" + Guid.NewGuid().ToString("N") + ".jsonl")
        return ServerOptions() {
            EnableHttp = true,
            HttpHost = "127.0.0.1",
            HttpPort = 0,
            TokenPath = tokenPath,
            AuditPath = auditPath,
        }
    }

    func buildFactories() ServerHost.ServiceFactories {
        var items = []LibraryItem{
            LibraryItem() { Asin = "B1", Title = "Foundation" },
            LibraryItem() { Asin = "B2", Title = "Dune" },
        }
        var lib = FakeLibraryService(items)
        var queue = InMemoryQueueService()
        var auth = FakeAuthService()
        var jobs = JobScheduler(FakeJobExecutor())
        var cfgPath = Path.Combine(Path.GetTempPath(), "oahu-http-cfg-" + Guid.NewGuid().ToString("N") + ".json")
        var cfg = JsonConfigService(cfgPath)
        var doctor = DoctorService()
        return ServerHost.ServiceFactories() {
            Auth = func() IAuthService { return auth },
            Library = func() ILibraryService { return lib },
            Queue = func() IQueueService { return queue },
            Job = func() IJobService { return jobs },
            Config = func() IConfigService { return cfg },
            Doctor = func() IDoctorService { return doctor },
        }
    }

    func resolveBaseUrl(app WebApplication) string {
        var server = app.Services.GetRequiredService[IServer]()
        var addrs IServerAddressesFeature? = server.Features.Get[IServerAddressesFeature]()
        var url = ""
        if addrs != nil {
            let first = addrs!!.Addresses.FirstOrDefault()
            if first != nil {
                url = first!!
            }
        }
        if url == "" {
            let appUrl = app.Urls.FirstOrDefault()
            if appUrl != nil {
                url = appUrl!!
            }
        }
        Assert.False(String.IsNullOrEmpty(url), "Server did not report a bound URL.")
        return url
    }

    @Fact
    func Missing_Token_Returns_401() {
        var options = buildOptions()
        var factories = buildFactories()
        var token = TokenStore(options.TokenPath).ReadOrCreate()
        var app = ServerHost.BuildHttpApp(options, factories)
        app.StartAsync().Wait()
        try {
            using let c = HttpClient() { BaseAddress = Uri(resolveBaseUrl(app)) }
            var resp = c.GetAsync("/v1/library").Result
            Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode)
        } finally {
            app.StopAsync().Wait()
            app.DisposeAsync().AsTask().Wait()
            File.Delete(options.TokenPath)
        }
    }

    @Fact
    func With_Token_Library_Endpoint_Returns_Items() {
        var options = buildOptions()
        var factories = buildFactories()
        var token = TokenStore(options.TokenPath).ReadOrCreate()
        var app = ServerHost.BuildHttpApp(options, factories)
        app.StartAsync().Wait()
        try {
            using let c = HttpClient() { BaseAddress = Uri(resolveBaseUrl(app)) }
            var hdrs = c.DefaultRequestHeaders
            hdrs.Authorization = AuthenticationHeaderValue("Bearer", token)
            var resp = c.GetAsync("/v1/library").Result
            resp.EnsureSuccessStatusCode()
            var json = resp.Content.ReadAsStringAsync().Result
            Assert.Contains("Foundation", json)
            Assert.Contains("Dune", json)
            Assert.Contains("\"total\":2", json)
        } finally {
            app.StopAsync().Wait()
            app.DisposeAsync().AsTask().Wait()
            File.Delete(options.TokenPath)
        }
    }

    @Fact
    func Queue_Add_Then_List_Then_Clear_Requires_Confirm() {
        var options = buildOptions()
        var factories = buildFactories()
        var token = TokenStore(options.TokenPath).ReadOrCreate()
        var app = ServerHost.BuildHttpApp(options, factories)
        app.StartAsync().Wait()
        try {
            using let c = HttpClient() { BaseAddress = Uri(resolveBaseUrl(app)) }
            var hdrs = c.DefaultRequestHeaders
            hdrs.Authorization = AuthenticationHeaderValue("Bearer", token)

            using let addBody = StringContent("{\"asins\":[\"B1\",\"B2\"]}", Encoding.UTF8, "application/json")
            var addResp = c.PostAsync("/v1/queue", addBody).Result
            addResp.EnsureSuccessStatusCode()

            var listJson = c.GetStringAsync("/v1/queue").Result
            Assert.Contains("\"total\":2", listJson)

            // Clear without confirm: should fail (Destructive denied).
            var clearNoConfirm = c.DeleteAsync("/v1/queue").Result
            Assert.False(clearNoConfirm.IsSuccessStatusCode)

            // Clear with confirm.
            var clearOk = c.DeleteAsync("/v1/queue?confirm=true").Result
            clearOk.EnsureSuccessStatusCode()

            var afterJson = c.GetStringAsync("/v1/queue").Result
            Assert.Contains("\"total\":0", afterJson)
        } finally {
            app.StopAsync().Wait()
            app.DisposeAsync().AsTask().Wait()
            File.Delete(options.TokenPath)
        }
    }

    @Fact
    func Non_Loopback_Bind_Refused() {
        var options = buildOptions()
        var factories = buildFactories()
        try {
            var bad = ServerOptions() {
                EnableHttp = true,
                HttpHost = "0.0.0.0",
                HttpPort = 0,
                TokenPath = options.TokenPath,
                AuditPath = options.AuditPath,
            }
            Assert.Throws[InvalidOperationException](func() { ServerHost.BuildHttpApp(bad, factories) })
        } finally {
            File.Delete(options.TokenPath)
        }
    }
}
