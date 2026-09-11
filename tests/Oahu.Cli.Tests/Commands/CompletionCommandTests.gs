package Oahu.Cli.Tests.Commands

import Oahu.Cli.Commands
import System
import Xunit

class CompletionCommandTests {
    @Theory
    @InlineData("bash")
    @InlineData("zsh")
    @InlineData("fish")
    @InlineData("pwsh")
    func Render_ProducesNonEmptyScriptForEverySupportedShell(shell string) {
        let script = CompletionCommand.Render(shell)
        Assert.False(string.IsNullOrWhiteSpace(script))
        Assert.Contains("oahu-cli", script)
    }

    @Fact
    func Render_BashIncludesEveryV1Subcommand() {
        let script = CompletionCommand.Render("bash")
        for sub in CompletionCommand.V1Subcommands {
            Assert.Contains(sub, script)
        }
    }

    @Fact
    func Render_UnknownShellThrows() {
        Assert.Throws[ArgumentException](
            func () object? {
                return CompletionCommand.Render("powershell")
            }
        )
    }

    @Fact
    func SupportedShells_StableSet() {
        Assert.Equal([]string{"bash", "zsh", "fish", "pwsh"}, CompletionCommand.SupportedShells)
    }
}
