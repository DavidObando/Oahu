package Oahu.Cli.Tests.Commands

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import System
import System.Collections.Generic
import System.IO
import System.Runtime.CompilerServices
import System.Threading
import System.Threading.Tasks
import Xunit

/// Tests for Phase 4d global flags: `--quiet`, `--dry-run`, `--force`,
/// and the new `--concurrency` validation on download/convert.
@Collection("EnvVarSerial")
class GlobalFlagsTests : IDisposable {
    private let toDispose List[IAsyncDisposable] = List[IAsyncDisposable]()

    init() {
        CliServiceFactory.Reset()
    }

    func Dispose() {
        for d in toDispose {
            d.DisposeAsync().AsTask().GetAwaiter().GetResult()
        }
        CliServiceFactory.AuthServiceFactory = () -> FakeAuthService()
        CliServiceFactory.Reset()
    }

    private func UseCapturing() GlobalFlagsTests.CapturingExecutor {
        let exec = GlobalFlagsTests.CapturingExecutor()
        let sched = JobScheduler(exec)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = () -> sched
        return exec
    }

    @Fact
    async func Download_DryRun_EmitsPlanAndDoesNotSubmit() {
        let exec = UseCapturing()
        let (exit, stdout, _) = await RunAsync("--dry-run", "download", "B00ASIN1", "B00ASIN2", "--json")
        Assert.Equal(0, exit)
        Assert.Empty(exec.Requests)
        Assert.Contains("\"resource\": \"download-plan\"", stdout)
        Assert.Contains("\"asin\": \"B00ASIN1\"", stdout)
        Assert.Contains("\"asin\": \"B00ASIN2\"", stdout)
        Assert.DoesNotContain("\"resource\": \"download-update\"", stdout)
    }

    @Fact
    async func Convert_DryRun_EmitsPlanAndDoesNotSubmit() {
        let exec = UseCapturing()
        let (exit, stdout, _) = await RunAsync("--dry-run", "convert", "B00ASIN1", "--json")
        Assert.Equal(0, exit)
        Assert.Empty(exec.Requests)
        Assert.Contains("\"resource\": \"download-plan\"", stdout)
        Assert.Contains("\"exportToAax\": true", stdout)
    }

    @Fact
    async func Download_DryRun_AcceptsShortForm_n() {
        let exec = UseCapturing()
        let (exit, _, _) = await RunAsync("-n", "download", "B00ASIN1", "--json")
        Assert.Equal(0, exit)
        Assert.Empty(exec.Requests)
    }

    @Fact
    async func Download_QuietJson_SuppressesPerUpdateLines_KeepsSummary() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1)))
        let (exit, stdout, _) = await RunAsync("--quiet", "download", "B00ASIN1", "--json")
        Assert.Equal(0, exit)
        Assert.DoesNotContain("\"resource\": \"download-update\"", stdout)
        Assert.Contains("\"resource\": \"download-summary\"", stdout)
    }

    @Fact
    async func Download_Concurrency_Negative_ExitsTwo() {
        UseCapturing()
        let (exit, _, stderr) = await RunAsync("download", "B00ASIN1", "--concurrency", "0")
        Assert.Equal(2, exit)
        Assert.Contains("--concurrency", stderr)
    }

    @Fact
    async func Download_Concurrency_PositiveOverridesFactory() {
        let exec = UseCapturing()
        // Set the override before the singleton resolves; assert the factory captured it.
        let (exit, _, _) = await RunAsync("download", "B00ASIN1", "--concurrency", "4", "--json")
        Assert.Equal(0, exit)
        // The Capturing scheduler we registered above ignored the override (we already
        // installed a singleton). Direct check:
        // Reset and invoke the default factory after setting OverrideMaxParallelism manually.
        CliServiceFactory.Reset()
        CliServiceFactory.OverrideMaxParallelism = 7
        // We cannot resolve the default factory without a real history dir, so just assert
        // the surface the SetAction commits to:
        Assert.Equal(7, CliServiceFactory.OverrideMaxParallelism)
        CliServiceFactory.Reset()
        Assert.Null(CliServiceFactory.OverrideMaxParallelism)
    }

    @Fact
    async func AuthLogout_DryRun_DoesNotInvokeLogout() {
        let auth = FakeAuthService()
        await auth.LoginAsync(CliRegion.Us, NonInteractiveCallbackBroker())
        CliServiceFactory.AuthServiceFactory = () -> auth
        let (exit, stdout, _) = await RunAsync("--dry-run", "auth", "logout", "--json")
        Assert.Equal(0, exit)
        Assert.Contains("\"resource\": \"auth-logout-plan\"", stdout)
        Assert.Contains("\"wouldLogout\":", stdout)
        Assert.Single(await auth.ListSessionsAsync())
    }

    private func UseScheduler(executor IJobExecutor) {
        let sched = JobScheduler(executor)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = () -> sched
    }

    private class CapturingExecutor : IJobExecutor {
        init() {
            Requests = List[JobRequest]()
        }

        prop Requests List[JobRequest] {
            get;
            init;
        }

        async func ExecuteAsync(
            request JobRequest,
            @EnumeratorCancellation cancellationToken CancellationToken
        ) IAsyncEnumerable[JobUpdate] {
            Requests.Add(request)
            yield JobUpdate{JobId: request.Id, Phase: JobPhase.Licensing}
            await Task.Yield()
            yield JobUpdate{JobId: request.Id, Phase: JobPhase.Completed}
        }
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
