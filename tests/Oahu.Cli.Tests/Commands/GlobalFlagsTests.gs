// G# port of Commands/GlobalFlagsTests.cs.
//
// Tests Phase 4d global flags: --quiet, --dry-run, --force, --concurrency.

package Oahu.Cli.Tests.Commands

import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks
import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import Xunit

class GlobalFlagsTests : IDisposable {
    var toDispose List[IAsyncDisposable]

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

    func UseCapturing() CapturingExecutor {
        let exec = CapturingExecutor()
        let sched = JobScheduler(exec)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = func() IJobService { return sched }
        return exec
    }

    func UseScheduler(executor IJobExecutor) {
        let sched = JobScheduler(executor)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = func() IJobService { return sched }
    }

    func runCli(args []string) E2ECmdResult {
        let origOut = Console.Out
        let origErr = Console.Error
        let origCliOut = CliEnvironment.Out
        let origCliErr = CliEnvironment.Error
        let sw = StringWriter()
        let ew = StringWriter()
        Console.SetOut(sw)
        Console.SetError(ew)
        CliEnvironment.Out = sw
        CliEnvironment.Error = ew
        try {
            let root = RootCommandFactory.Create(func() ILoggerFactory { return NullLoggerFactory.Instance })
            let parse = root.Parse(args)
            let exit = parse.InvokeAsync().GetAwaiter().GetResult()
            return E2ECmdResult(exit, sw.ToString(), ew.ToString())
        } finally {
            Console.SetOut(origOut)
            Console.SetError(origErr)
            CliEnvironment.Out = origCliOut
            CliEnvironment.Error = origCliErr
        }
    }

    @Fact
    func Download_DryRun_EmitsPlanAndDoesNotSubmit() {
        let exec = UseCapturing()
        let r = runCli([]string{"--dry-run", "download", "B00ASIN1", "B00ASIN2", "--json"})
        Assert.Equal(0, r.Exit)
        Assert.Empty(exec.Requests)
        Assert.Contains("\"resource\": \"download-plan\"", r.Stdout)
        Assert.Contains("\"asin\": \"B00ASIN1\"", r.Stdout)
        Assert.Contains("\"asin\": \"B00ASIN2\"", r.Stdout)
        Assert.DoesNotContain("\"resource\": \"download-update\"", r.Stdout)
    }

    @Fact
    func Convert_DryRun_EmitsPlanAndDoesNotSubmit() {
        let exec = UseCapturing()
        let r = runCli([]string{"--dry-run", "convert", "B00ASIN1", "--json"})
        Assert.Equal(0, r.Exit)
        Assert.Empty(exec.Requests)
        Assert.Contains("\"resource\": \"download-plan\"", r.Stdout)
        Assert.Contains("\"exportToAax\": true", r.Stdout)
    }

    @Fact
    func Download_DryRun_AcceptsShortForm_n() {
        let exec = UseCapturing()
        let r = runCli([]string{"-n", "download", "B00ASIN1", "--json"})
        Assert.Equal(0, r.Exit)
        Assert.Empty(exec.Requests)
    }

    @Fact
    func Download_QuietJson_SuppressesPerUpdateLines_KeepsSummary() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1)))
        let r = runCli([]string{"--quiet", "download", "B00ASIN1", "--json"})
        Assert.Equal(0, r.Exit)
        Assert.DoesNotContain("\"resource\": \"download-update\"", r.Stdout)
        Assert.Contains("\"resource\": \"download-summary\"", r.Stdout)
    }

    @Fact
    func Download_Concurrency_Negative_ExitsTwo() {
        UseCapturing()
        let r = runCli([]string{"download", "B00ASIN1", "--concurrency", "0"})
        Assert.Equal(2, r.Exit)
        Assert.Contains("--concurrency", r.Stderr)
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

    @Fact
    func AuthLogout_DryRun_DoesNotInvokeLogout() {
        let auth = FakeAuthService()
        auth.LoginAsync(CliRegion.Us, NonInteractiveCallbackBroker()).GetAwaiter().GetResult()
        CliServiceFactory.AuthServiceFactory = func() IAuthService { return auth }
        let r = runCli([]string{"--dry-run", "auth", "logout", "--json"})
        Assert.Equal(0, r.Exit)
        Assert.Contains("\"resource\": \"auth-logout-plan\"", r.Stdout)
        Assert.Contains("\"wouldLogout\":", r.Stdout)
        Assert.Single(auth.ListSessionsAsync().Result)
    }
}
