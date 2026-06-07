// G# port of E2E SmokeTests.cs.
//
// Spawns the built oahu-cli binary in a subprocess and asserts on the
// observable surface (exit code + stdout/stderr) for the most common flags
// and commands.
//
// NOTE (G# 0.1.431, gsharp#502 partial fix): the C# original is `async Task`;
// `async func` class members parse now but their `Task<T>` return type isn't
// wired up (see CliRunner.gs). These tests therefore drive the synchronous
// CliRunner.

package Oahu.Cli.E2E.Tests.Experiment

import System
import Xunit

type SmokeTests class {
    @Fact
    func Version_PrintsVersion() {
        var cli = CliRunner()
        var r = cli.RunRaw([]string{"--version"})
        Assert.Equal(0, r.ExitCode)
        Assert.False(String.IsNullOrWhiteSpace(r.StdOut))
    }

    @Fact
    func Help_PrintsUsage() {
        var cli = CliRunner()
        var r = cli.RunRaw([]string{"--help"})
        Assert.Equal(0, r.ExitCode)
        Assert.Contains("Usage", r.AllOutput())
    }

    @Fact
    func Doctor_RunsAndExits() {
        var cli = CliRunner()
        var r = cli.Run([]string{"doctor"})
        // Doctor may surface warnings (exit 0) or environment problems (non-zero).
        // We only assert that it runs to completion and produces output.
        Assert.False(String.IsNullOrWhiteSpace(r.AllOutput()))
    }

    @Fact
    func Config_Get_Json_Returns_Valid_Output() {
        var cli = CliRunner()
        var r = cli.Run([]string{"config", "get", "--json"})
        Assert.Equal(0, r.ExitCode)
        Assert.False(String.IsNullOrWhiteSpace(r.StdOut))
    }

    @Fact
    func Unknown_Command_Returns_NonZero() {
        var cli = CliRunner()
        var r = cli.Run([]string{"definitely-not-a-real-command"})
        Assert.NotEqual(0, r.ExitCode)
    }
}
