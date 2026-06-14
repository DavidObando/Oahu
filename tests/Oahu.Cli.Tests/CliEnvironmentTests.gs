// G# port of CliEnvironmentTests.cs.
//
// Covers CliEnvironment.Initialise idempotency and RegisterRestore/RunRestore
// cycle safety.

package Oahu.Cli.Tests

import System
import Oahu.Cli
import Xunit

class CliEnvironmentTests {
    @Fact
    func Initialise_IsIdempotent() {
        CliEnvironment.Initialise()
        CliEnvironment.Initialise()
    }

    @Fact
    func RegisterRestore_IsCalledByRunRestore() {
        var called = 0
        CliEnvironment.RegisterRestore(func() { called = called + 1 })

        CliEnvironment.RunRestore()
        CliEnvironment.RunRestore()   // second call is a no-op (callback was cleared).

        Assert.Equal(1, called)
    }

    @Fact
    func RunRestore_SwallowsExceptionsFromCallback() {
        CliEnvironment.RegisterRestore(func() {
            throw InvalidOperationException("boom")
        })
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
        CliEnvironment.Initialise()
    }
}
