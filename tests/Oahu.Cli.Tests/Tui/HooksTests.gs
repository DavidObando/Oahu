package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Hooks
import System
import Xunit

@Collection("EnvVarSerial")
class HooksTests {
    @Fact
    func ScreenReaderProbe_Honours_Force_Env_Var() {
        let prev = Environment.GetEnvironmentVariable("OAHU_SCREEN_READER")
        try {
            Environment.SetEnvironmentVariable("OAHU_SCREEN_READER", "1")
            Assert.True(ScreenReaderProbe.IsActive())
        } finally {
            Environment.SetEnvironmentVariable("OAHU_SCREEN_READER", prev)
        }
    }

    @Fact
    func ScreenReaderProbe_NoTui_Env_Forces_True() {
        let prev = Environment.GetEnvironmentVariable("OAHU_NO_TUI")
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
        let prev = Environment.GetEnvironmentVariable(envVar)
        try {
            Environment.SetEnvironmentVariable(envVar, "test-value")
            Assert.True(SshDetector.IsSshSession())
        } finally {
            Environment.SetEnvironmentVariable(envVar, prev)
        }
    }
}

@CollectionDefinition("EnvVarSerial", DisableParallelization: true)
class EnvVarSerialCollection { }
