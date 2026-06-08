// G# port of Commands/CompletionCommandTests.cs — full port.
// Workaround: CLR string[] is not indexable (GS0116); use Length + Contains.

package Oahu.Cli.Tests.Experiment.Commands

import System
import System.Linq
import Oahu.Cli.Commands
import Xunit

type CompletionCommandTests class {
    @Theory
    @InlineData("bash")
    @InlineData("zsh")
    @InlineData("fish")
    @InlineData("pwsh")
    func Render_ProducesNonEmptyScriptForEverySupportedShell(shell string) {
        var script = CompletionCommand.Render(shell)
        Assert.False(String.IsNullOrWhiteSpace(script))
        Assert.Contains("oahu-cli", script)
    }

    @Fact
    func Render_BashIncludesEveryV1Subcommand() {
        var script = CompletionCommand.Render("bash")
        for sub in CompletionCommand.V1Subcommands {
            Assert.Contains(sub, script)
        }
    }

    @Fact
    func Render_UnknownShellThrows() {
        Assert.Throws[ArgumentException](func() { CompletionCommand.Render("powershell") })
    }

    @Fact
    func SupportedShells_StableSet() {
        Assert.Equal(4, CompletionCommand.SupportedShells.Length)
        Assert.Contains("bash", CompletionCommand.SupportedShells)
        Assert.Contains("zsh", CompletionCommand.SupportedShells)
        Assert.Contains("fish", CompletionCommand.SupportedShells)
        Assert.Contains("pwsh", CompletionCommand.SupportedShells)
    }
}
