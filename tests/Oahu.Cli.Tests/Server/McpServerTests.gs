package Oahu.Cli.Tests.Server

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
import System
import System.IO
import System.Linq
import Xunit

class McpServerTests {
    @Fact
    func StdioHost_Registers_Mcp_Tools() {
        using let host = ServerHost.BuildStdioHost(ServerOptions{EnableStdio: true, Unattended: true}, BuildFactories())
        let tools = host.Services.GetServices[McpServerTool]().ToArray()
        Assert.Equal(16, tools.Length)
    }

    shared {
        private func BuildFactories() ServerHost.ServiceFactories {
            let lib = FakeLibraryService([]LibraryItem{LibraryItem{Asin: "B1", Title: "Foundation"}})
            let queue = InMemoryQueueService()
            let auth = FakeAuthService()
            let jobs = JobScheduler(FakeJobExecutor())
            let configPath = Path.Combine(Path.GetTempPath(), "oahu-mcp-cfg-${Guid.NewGuid():n}.json")
            let cfg = JsonConfigService(configPath)
            let doctor = DoctorService()
            return ServerHost.ServiceFactories{
                Auth: () -> auth,
                Library: () -> lib,
                Queue: () -> queue,
                Job: () -> jobs,
                Config: () -> cfg,
                Doctor: () -> doctor
            }
        }
    }
}
