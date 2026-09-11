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
import System.Runtime.CompilerServices
import System.Threading
import System.Threading.Tasks
import Xunit

@Collection("EnvVarSerial")
class ConvertCommandTests : IDisposable {
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

    private func UseCapturing() ConvertCommandTests.CapturingExecutor {
        let exec = ConvertCommandTests.CapturingExecutor()
        let sched = JobScheduler(exec)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = () -> sched
        return exec
    }

    @Fact
    async func NoArgs_ExitsTwo() {
        UseCapturing()
        let (exit, _, stderr) = await RunAsync("convert")
        Assert.Equal(2, exit)
    }

    @Fact
    async func SingleAsin_SetsExportToAax_True() {
        let exec = UseCapturing()
        let (exit, stdout, _) = await RunAsync("convert", "B00ASIN1", "--json")
        Assert.Equal(0, exit)
        Assert.Single(exec.Requests)
        Assert.True(exec.Requests[0].ExportToAax)
        Assert.Equal("B00ASIN1", exec.Requests[0].Asin)
        Assert.Contains("\"resource\": \"download-summary\"", stdout)
    }

    @Fact
    async func OutputDir_Is_Forwarded() {
        let exec = UseCapturing()
        let (exit, _, _) = await RunAsync("convert", "B00ASIN1", "--output-dir", "/tmp/out", "--json")
        Assert.Equal(0, exit)
        Assert.Equal("/tmp/out", exec.Requests[0].OutputDir)
    }

    @Fact
    async func DownloadCommand_ExportFlag_Aax_SetsExportToAax() {
        let exec = UseCapturing()
        let (exit, _, _) = await RunAsync("download", "B00ASIN1", "--export", "aax", "--output-dir", "/tmp/d", "--json")
        Assert.Equal(0, exit)
        Assert.True(exec.Requests[0].ExportToAax)
        Assert.Equal("/tmp/d", exec.Requests[0].OutputDir)
    }

    @Fact
    async func DownloadCommand_ExportFlag_Invalid_ExitsTwo() {
        UseCapturing()
        let (exit, _, stderr) = await RunAsync("download", "B00ASIN1", "--export", "wav")
        Assert.Equal(2, exit)
        Assert.Contains("--export", stderr)
    }

    @Fact
    async func DownloadCommand_NoExportFlag_DefaultsFalse() {
        let exec = UseCapturing()
        let (exit, _, _) = await RunAsync("download", "B00ASIN1", "--json")
        Assert.Equal(0, exit)
        Assert.False(exec.Requests[0].ExportToAax)
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
