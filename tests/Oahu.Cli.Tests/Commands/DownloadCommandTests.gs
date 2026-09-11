package Oahu.Cli.Tests.Commands

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks
import Xunit

/// End-to-end tests for `oahu-cli download`. Drives (cref:RootCommandFactory)
/// with a (cref:JobScheduler) backed by (cref:FakeJobExecutor) so the test
/// surface exercises the full streaming + summary path without touching Core.
@Collection("EnvVarSerial")
class DownloadCommandTests : IDisposable {
    private let toDispose List[IAsyncDisposable] = List[IAsyncDisposable]()

    init() {
        CliServiceFactory.Reset()
    }

    func Dispose() {
        for d in toDispose {
            d.DisposeAsync().AsTask().GetAwaiter().GetResult()
        }
        CliServiceFactory.Reset()
    }

    private func UseScheduler(executor IJobExecutor) {
        let sched = JobScheduler(executor)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = () -> sched
    }

    @Fact
    async func NoArgs_ExitsTwo_AndPrintsHint() {
        UseScheduler(FakeJobExecutor())
        let (exit, _, stderr) = await RunAsync("download")
        Assert.Equal(2, exit)
        Assert.Contains("no ASINs", stderr, StringComparison.OrdinalIgnoreCase)
    }

    @Fact
    async func InvalidQuality_ExitsTwo() {
        UseScheduler(FakeJobExecutor())
        let (exit, _, stderr) = await RunAsync("download", "B0001", "--quality", "ultra")
        Assert.Equal(2, exit)
        Assert.Contains("--quality", stderr)
    }

    @Fact
    async func SingleAsin_Completes_Json_StreamsUpdatesAndSummary() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1)))
        let (exit, stdout, _) = await RunAsync("download", "B00ASIN1", "--json")
        Assert.Equal(0, exit)
        // Each JobUpdate becomes a line; the final document is the summary.
        Assert.Contains("\"resource\": \"download-update\"", stdout)
        Assert.Contains("\"phase\": \"Licensing\"", stdout)
        Assert.Contains("\"phase\": \"Downloading\"", stdout)
        Assert.Contains("\"phase\": \"Decrypting\"", stdout)
        Assert.Contains("\"phase\": \"Exporting\"", stdout)
        Assert.Contains("\"phase\": \"Completed\"", stdout)
        Assert.Contains("\"resource\": \"download-summary\"", stdout)
        Assert.Contains("\"completed\": 1", stdout)
        Assert.Contains("\"failed\": 0", stdout)
        Assert.Contains("\"asin\": \"B00ASIN1\"", stdout)
    }

    @Fact
    async func FailingExecutor_ExitsOne_AndSummaryReportsFailure() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1), failAtDecrypt: true))
        let (exit, stdout, _) = await RunAsync("download", "B00DEAD", "--json")
        Assert.Equal(1, exit)
        Assert.Contains("\"failed\": 1", stdout)
        Assert.Contains("\"phase\": \"Failed\"", stdout)
    }

    @Fact
    async func MultipleAsins_AllSucceed_ExitZero() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1)))
        let (exit, stdout, _) = await RunAsync("download", "B0001", "B0002", "B0003", "--json")
        Assert.Equal(0, exit)
        Assert.Contains("\"completed\": 3", stdout)
    }

    @Fact
    async func DuplicateAsins_ArePresentedOnce() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1)))
        let (exit, stdout, _) = await RunAsync("download", "B0042", "b0042", "--json")
        Assert.Equal(0, exit)
        // Distinct (case-insensitive) — one job, one summary entry.
        Assert.Contains("\"completed\": 1", stdout)
    }

    shared {
        private async func RunAsync(args ...string)(exit int32, stdout string, stderr string) {
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
                let root = RootCommandFactory.Create(
                    func () ILoggerFactory {
                        return NullLoggerFactory.Instance
                    }
                )
                let parse = root.Parse(args)
                let exit = await parse.InvokeAsync()
                return (exit, sw.ToString(), ew.ToString())
            } finally {
                Console.SetOut(origOut)
                Console.SetError(origErr)
                CliEnvironment.Out = origCliOut
                CliEnvironment.Error = origCliErr
            }
        }
    }
}
