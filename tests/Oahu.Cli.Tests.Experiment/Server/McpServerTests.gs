// G# port of Server/McpServerTests.cs

package Oahu.Cli.Tests.Experiment.Server

import System
import System.IO
import System.Linq
import Microsoft.Extensions.DependencyInjection
import ModelContextProtocol.Server
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Server.Hosting
import Xunit

type McpServerTests class {
    func buildFactories() ServerHost.ServiceFactories {
        var items = []LibraryItem{
            LibraryItem() { Asin = "B1", Title = "Foundation" },
        }
        var lib = FakeLibraryService(items)
        var queue = InMemoryQueueService()
        var auth = FakeAuthService()
        var jobs = JobScheduler(FakeJobExecutor())
        var cfgPath = Path.Combine(Path.GetTempPath(), "oahu-mcp-cfg-" + Guid.NewGuid().ToString("N") + ".json")
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

    @Fact
    func StdioHost_Registers_Mcp_Tools() {
        var opts = ServerOptions() { EnableStdio = true, Unattended = true }
        using let host = ServerHost.BuildStdioHost(opts, buildFactories())

        var tools = host.Services.GetServices[McpServerTool]().ToArray()

        Assert.Equal(16, tools.Length)
    }
}
