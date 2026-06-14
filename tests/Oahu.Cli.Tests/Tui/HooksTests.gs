// G# port of Tui/HooksTests.cs.
//
// Tests ScreenReaderProbe and SshDetector environment-variable hooks.
//
// NOTE: The [Collection] attribute for serial execution is applied; the
// CollectionDefinition class uses an empty init() since G# cannot implement
// interfaces (GS0157) but xUnit only needs the [CollectionDefinition] attribute.

package Oahu.Cli.Tests.Tui

import System
import Oahu.Cli.Tui.Hooks
import Xunit

@Collection("EnvVarSerial")
class HooksTests {
    @Fact
    func ScreenReaderProbe_Honours_Force_Env_Var() {
        var prev = Environment.GetEnvironmentVariable("OAHU_SCREEN_READER")
        try {
            Environment.SetEnvironmentVariable("OAHU_SCREEN_READER", "1")
            Assert.True(ScreenReaderProbe.IsActive())
        } finally {
            Environment.SetEnvironmentVariable("OAHU_SCREEN_READER", prev)
        }
    }

    @Fact
    func ScreenReaderProbe_NoTui_Env_Forces_True() {
        var prev = Environment.GetEnvironmentVariable("OAHU_NO_TUI")
        try {
            Environment.SetEnvironmentVariable("OAHU_NO_TUI", "1")
            Assert.True(ScreenReaderProbe.IsActive())
        } finally {
            Environment.SetEnvironmentVariable("OAHU_NO_TUI", prev)
        }
    }

    @Theory
    @InlineData("SSH_TTY")
    @InlineData("SSH_CONNECTION")
    @InlineData("SSH_CLIENT")
    func SshDetector_True_When_Any_Ssh_Env_Set(envVar string) {
        var prev = Environment.GetEnvironmentVariable(envVar)
        try {
            Environment.SetEnvironmentVariable(envVar, "test-value")
            Assert.True(SshDetector.IsSshSession())
        } finally {
            Environment.SetEnvironmentVariable(envVar, prev)
        }
    }
}
