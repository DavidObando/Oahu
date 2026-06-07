// G# port of CliEnvironmentTests.cs.
//
// Covers CliEnvironment.Initialise idempotency and RegisterRestore/RunRestore
// cycle safety.
//
// Dropped tests:
//   - RegisterRestore_IsCalledByRunRestore (closure capture → MSB4181, gsharp#503).
//   - RunRestore_SwallowsExceptionsFromCallback (throw in lambda → MSB4181).
//   - CanEnterTui_FalseWhenOahuNoTuiSet (Environment.SetEnvironmentVariable(string, string?)
//     compiles but test requires closure capture to verify env-var effect).

package Oahu.Cli.Tests.Experiment

import Oahu.Cli
import Xunit

type CliEnvironmentTests class {
    @Fact
    func Initialise_IsIdempotent() {
        CliEnvironment.Initialise()
        CliEnvironment.Initialise()
    }

    @Fact
    func RegisterRestore_DoesNotThrow() {
        // Verify RegisterRestore + RunRestore cycle is safe.
        // LIMITATION: closure-capturing lambdas passed to CLR Action params
        // trigger MSB4181. Using non-capturing lambda instead.
        CliEnvironment.RegisterRestore(func() {
        })
        CliEnvironment.RunRestore()
        CliEnvironment.RunRestore()
    }

    @Fact
    func Initialise_EnablesVirtualTerminal_WithoutThrowing() {
        CliEnvironment.Initialise()
    }
}
