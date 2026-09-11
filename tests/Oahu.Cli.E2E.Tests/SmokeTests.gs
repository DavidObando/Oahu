package Oahu.Cli.E2E.Tests

import System.Threading.Tasks
import Xunit

class SmokeTests {
    @Fact
    async func Version_PrintsVersion() {
        let cli = CliRunner()
        let r = await cli.RunRawAsync("--version")
        Assert.Equal(0, r.ExitCode)
        Assert.False(string.IsNullOrWhiteSpace(r.StdOut))
    }

    @Fact
    async func Help_PrintsUsage() {
        let cli = CliRunner()
        let r = await cli.RunRawAsync("--help")
        Assert.Equal(0, r.ExitCode)
        Assert.Contains("Usage", r.AllOutput)
    }

    @Fact
    async func Doctor_RunsAndExits() {
        let cli = CliRunner()
        let r = await cli.RunAsync("doctor")
        // Doctor may surface warnings (exit 0) or environment problems (non-zero).
        // We only assert that it runs to completion and produces output.
        Assert.False(string.IsNullOrWhiteSpace(r.AllOutput))
    }

    @Fact
    async func Config_Get_Json_Returns_Valid_Output() {
        let cli = CliRunner()
        let r = await cli.RunAsync("config", "get", "--json")
        Assert.Equal(0, r.ExitCode)
        Assert.False(string.IsNullOrWhiteSpace(r.StdOut))
    }

    @Fact
    async func Unknown_Command_Returns_NonZero() {
        let cli = CliRunner()
        let r = await cli.RunAsync("definitely-not-a-real-command")
        Assert.NotEqual(0, r.ExitCode)
    }
}
