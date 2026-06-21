package Oahu.Cli.E2E.Tests

import System.Threading.Tasks
import Xunit

/// Spawns the built oahu-cli binary in a subprocess and asserts on the
/// observable surface (exit code + stdout/stderr) for the most common flags
/// and commands.
class SmokeTests {
    @Fact
    async func Version_PrintsVersion() {
        var cli = CliRunner()
        var r = await cli.RunRawAsync([]string{"--version"})
        Assert.Equal(0, r.ExitCode)
        Assert.False(String.IsNullOrWhiteSpace(r.StdOut))
    }

    @Fact
    async func Help_PrintsUsage() {
        var cli = CliRunner()
        var r = await cli.RunRawAsync([]string{"--help"})
        Assert.Equal(0, r.ExitCode)
        Assert.Contains("Usage", r.AllOutput)
    }

    @Fact
    async func Doctor_RunsAndExits() {
        var cli = CliRunner()
        var r = await cli.RunAsync([]string{"doctor"})
        // Doctor may surface warnings (exit 0) or environment problems (non-zero).
        // We only assert that it runs to completion and produces output.
        Assert.False(String.IsNullOrWhiteSpace(r.AllOutput))
    }

    @Fact
    async func Config_Get_Json_Returns_Valid_Output() {
        var cli = CliRunner()
        var r = await cli.RunAsync([]string{"config", "get", "--json"})
        Assert.Equal(0, r.ExitCode)
        Assert.False(String.IsNullOrWhiteSpace(r.StdOut))
    }

    @Fact
    async func Unknown_Command_Returns_NonZero() {
        var cli = CliRunner()
        var r = await cli.RunAsync([]string{"definitely-not-a-real-command"})
        Assert.NotEqual(0, r.ExitCode)
    }
}
