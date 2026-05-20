using System;
using System.IO;
using System.Linq;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Server;
using Oahu.Cli.App.Auth;
using Oahu.Cli.App.Config;
using Oahu.Cli.App.Doctor;
using Oahu.Cli.App.Jobs;
using Oahu.Cli.App.Library;
using Oahu.Cli.App.Models;
using Oahu.Cli.App.Queue;
using Oahu.Cli.Server.Hosting;
using Xunit;

namespace Oahu.Cli.Tests.Server;

public sealed class McpServerTests
{
    private static ServerHost.ServiceFactories BuildFactories()
    {
        var lib = new FakeLibraryService(new[]
        {
            new LibraryItem { Asin = "B1", Title = "Foundation" },
        });
        var queue = new InMemoryQueueService();
        var auth = new FakeAuthService();
        var jobs = new JobScheduler(new FakeJobExecutor());
        var configPath = Path.Combine(Path.GetTempPath(), $"oahu-mcp-cfg-{Guid.NewGuid():n}.json");
        var cfg = new JsonConfigService(configPath);
        var doctor = new DoctorService();

        return new ServerHost.ServiceFactories
        {
            Auth = () => auth,
            Library = () => lib,
            Queue = () => queue,
            Job = () => jobs,
            Config = () => cfg,
            Doctor = () => doctor,
        };
    }

    [Fact]
    public void StdioHost_Registers_Mcp_Tools()
    {
        using var host = ServerHost.BuildStdioHost(
            new ServerOptions { EnableStdio = true, Unattended = true },
            BuildFactories());

        var tools = host.Services.GetServices<McpServerTool>().ToArray();

        Assert.Equal(16, tools.Length);
    }
}
