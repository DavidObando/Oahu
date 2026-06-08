// G# port of Commands/GlobalFlagsTests.cs — PARTIAL for 0.1.459.
// Tests that use RunAsync (root command parsing + InvokeAsync) are dropped
// because the InvokeAsync / Parse calls trigger GS9998 ICE.
// Only the Concurrency_PositiveOverridesFactory test is portable (no RunCmd needed).

package Oahu.Cli.Tests.Experiment.Commands

import System
import System.Collections.Generic
import System.IO
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import Xunit

type GlobalFlagsTests class : IDisposable {
    toDispose List[IAsyncDisposable]

    init() {
        CliServiceFactory.Reset()
        toDispose = List[IAsyncDisposable]()
    }

    func Dispose() {
        for d in toDispose {
            d.DisposeAsync().AsTask().GetAwaiter().GetResult()
        }
        CliServiceFactory.AuthServiceFactory = func() IAuthService { return FakeAuthService() }
        CliServiceFactory.Reset()
    }

    func UseScheduler(executor IJobExecutor) {
        var sched = JobScheduler(executor)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = func() IJobService { return sched }
    }

    @Fact
    func Download_Concurrency_PositiveOverridesFactory() {
        // Test the OverrideMaxParallelism static property surface directly.
        CliServiceFactory.Reset()
        CliServiceFactory.OverrideMaxParallelism = 7
        Assert.Equal(7, CliServiceFactory.OverrideMaxParallelism!!)
        CliServiceFactory.Reset()
        Assert.Null(CliServiceFactory.OverrideMaxParallelism)
    }

    // Tests requiring RunAsync (root.Parse + parse.InvokeAsync) are blocked:
    // GS9998 ICE triggered by CommandLineParser generics in InvokeAsync.
    // Affected: Download_DryRun, Convert_DryRun, Download_DryRun_AcceptsShortForm,
    // Download_QuietJson, Download_Concurrency_Negative, AuthLogout_DryRun.
}
