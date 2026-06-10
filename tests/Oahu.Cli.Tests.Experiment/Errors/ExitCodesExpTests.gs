// Sanity tests for src/Oahu.Cli.App.Experiment/Errors/ExitCodes.gs.

package Oahu.Cli.Tests.Experiment.Errors

import System.Collections.Generic
import Oahu.Cli.App.Experiment.Errors
import Xunit

type ExitCodesExpTests class {

    @Fact
    func ExitCodes_Success_IsZero() {
        var c = ExitCodes()
        Assert.Equal[int32](0, c.Success)
    }

    @Fact
    func ExitCodes_Cancelled_Is130() {
        var c = ExitCodes()
        Assert.Equal[int32](130, c.Cancelled)
    }

    @Fact
    func ExitCodes_GenericFailure_IsOne() {
        var c = ExitCodes()
        Assert.Equal[int32](1, c.GenericFailure)
    }

    @Fact
    func ExitCodes_UsageError_IsTwo() {
        var c = ExitCodes()
        Assert.Equal[int32](2, c.UsageError)
    }

    @Fact
    func ExitCodes_AllCodes_Unique() {
        var c = ExitCodes()
        let codes = []int32{
            c.Success, c.GenericFailure, c.UsageError, c.AuthError,
            c.AudibleApiError, c.DecryptError, c.Locked, c.Cancelled,
        }
        var seen = HashSet[int32]()
        for code in codes {
            Assert.True(seen.Add(code))
        }
    }
}
