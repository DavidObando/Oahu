// G# port of Commands/DownloadCommandTests.cs — for 0.1.509.
// Uses FakeJobExecutor from Oahu.Cli.App (C# concrete type).
// gsharp#570 (slice→IReadOnlyList) unblocks RunCmd.

package Oahu.Cli.Tests.Experiment.Commands

import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks
import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import Xunit

@Collection("EnvVarSerial")
type DownloadCommandTests class : IDisposable {
    toDispose List[IAsyncDisposable]

    init() {
        toDispose = List[IAsyncDisposable]()
        CliServiceFactory.Reset()
    }

    func Dispose() {
        for d in toDispose {
            d.DisposeAsync().AsTask().GetAwaiter().GetResult()
        }
        CliServiceFactory.Reset()
    }

    func UseScheduler(executor IJobExecutor) {
        var sched = JobScheduler(executor)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = func() IJobService { return sched }
    }

    @Fact
    func NoArgs_ExitsTwo_AndPrintsHint() {
        UseScheduler(FakeJobExecutor())
        var result = DlRunCmd([]string{"download"})
        Assert.Equal(2, result.Exit)
        Assert.Contains("no ASINs", result.Stderr, StringComparison.OrdinalIgnoreCase)
    }

    @Fact
    func InvalidQuality_ExitsTwo() {
        UseScheduler(FakeJobExecutor())
        var result = DlRunCmd([]string{"download", "B0001", "--quality", "ultra"})
        Assert.Equal(2, result.Exit)
        Assert.Contains("--quality", result.Stderr)
    }

    @Fact
    func SingleAsin_Completes_Json_StreamsUpdatesAndSummary() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1)))
        var result = DlRunCmd([]string{"download", "B00ASIN1", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Contains("\"resource\": \"download-update\"", result.Stdout)
        Assert.Contains("\"phase\": \"Licensing\"", result.Stdout)
        Assert.Contains("\"phase\": \"Downloading\"", result.Stdout)
        Assert.Contains("\"phase\": \"Decrypting\"", result.Stdout)
        Assert.Contains("\"phase\": \"Exporting\"", result.Stdout)
        Assert.Contains("\"phase\": \"Completed\"", result.Stdout)
        Assert.Contains("\"resource\": \"download-summary\"", result.Stdout)
        Assert.Contains("\"completed\": 1", result.Stdout)
        Assert.Contains("\"failed\": 0", result.Stdout)
        Assert.Contains("\"asin\": \"B00ASIN1\"", result.Stdout)
    }

    @Fact
    func FailingExecutor_ExitsOne_AndSummaryReportsFailure() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1), true))
        var result = DlRunCmd([]string{"download", "B00DEAD", "--json"})
        Assert.Equal(1, result.Exit)
        Assert.Contains("\"failed\": 1", result.Stdout)
        Assert.Contains("\"phase\": \"Failed\"", result.Stdout)
    }

    @Fact
    func MultipleAsins_AllSucceed_ExitZero() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1)))
        var result = DlRunCmd([]string{"download", "B0001", "B0002", "B0003", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Contains("\"completed\": 3", result.Stdout)
    }

    @Fact
    func DuplicateAsins_ArePresentedOnce() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1)))
        var result = DlRunCmd([]string{"download", "B0042", "b0042", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Contains("\"completed\": 1", result.Stdout)
    }

    func DlRunCmd(args []string) E2ECmdResult {
        var origOut = Console.Out
        var origErr = Console.Error
        var origCliOut = CliEnvironment.Out
        var origCliErr = CliEnvironment.Error
        var sw = StringWriter()
        var ew = StringWriter()
        Console.SetOut(sw)
        Console.SetError(ew)
        CliEnvironment.Out = sw
        CliEnvironment.Error = ew
        try {
            var root = RootCommandFactory.Create(func() ILoggerFactory { return NullLoggerFactory.Instance })
            var parse = root.Parse(args)
            var exit = parse.InvokeAsync().Result
            return E2ECmdResult(exit, sw.ToString(), ew.ToString())
        } finally {
            Console.SetOut(origOut)
            Console.SetError(origErr)
            CliEnvironment.Out = origCliOut
            CliEnvironment.Error = origCliErr
        }
    }
}
