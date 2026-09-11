package Oahu.Cli.Tests

import Oahu.Cli
import System
import Xunit

class CliEnvironmentTests {
    @Fact
    func Initialise_IsIdempotent() {
        CliEnvironment.Initialise()
        CliEnvironment.Initialise()
        // No throw, no duplicate exit-trap.

    }

    @Fact
    func RegisterRestore_IsCalledByRunRestore() {
        var called = 0
        CliEnvironment.RegisterRestore(() -> called++)
        CliEnvironment.RunRestore()
        CliEnvironment.RunRestore() // second call is a no-op (callback was cleared).
        Assert.Equal(1, called)
    }

    @Fact
    func RunRestore_SwallowsExceptionsFromCallback() {
        CliEnvironment.RegisterRestore(() -> throw InvalidOperationException("boom"))
        // Must not throw — the exit-trap is the last line of defence.
        CliEnvironment.RunRestore()
    }

    @Fact
    func CanEnterTui_FalseWhenOahuNoTuiSet() {
        let prev = Environment.GetEnvironmentVariable("OAHU_NO_TUI")
        try {
            Environment.SetEnvironmentVariable("OAHU_NO_TUI", "1")
            CliEnvironment.Initialise()
            Assert.False(CliEnvironment.CanEnterTui)
        } finally {
            Environment.SetEnvironmentVariable("OAHU_NO_TUI", prev)
        }
    }

    @Fact
    func Initialise_EnablesVirtualTerminal_WithoutThrowing() {
        // EnableWindowsVirtualTerminal is best-effort; on any platform
        // (Windows, Linux, macOS, CI) Initialise must complete without error.
        CliEnvironment.Initialise()
    }
}
