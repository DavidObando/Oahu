// G# port of Commands/ConvertCommandTests.cs.
// All 6 tests recovered: gsharp#641 fixed unblocks async-yield-on-iface-impl,
// so CapturingExecutor (IJobExecutor with async-yield) compiles.

package Oahu.Cli.Tests.Commands

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

class CapturingExecutor : IJobExecutor {
    var Requests List[JobRequest]

    init() {
        Requests = List[JobRequest]()
    }

    async func ExecuteAsync(request JobRequest, cancellationToken CancellationToken) IAsyncEnumerable[JobUpdate] {
        Requests.Add(request)
        yield JobUpdate() { JobId = request.Id, Phase = JobPhase.Licensing }
        await Task.Yield()
        yield JobUpdate() { JobId = request.Id, Phase = JobPhase.Completed }
    }
}

@Collection("EnvVarSerial")
class ConvertCommandTests : IDisposable {
    var toDispose List[IAsyncDisposable]

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

    func UseCapturing() CapturingExecutor {
        let exec = CapturingExecutor()
        let sched = JobScheduler(exec)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = func() IJobService { return sched }
        return exec
    }

    @Fact
    func NoArgs_ExitsTwo() {
        UseCapturing()
        let result = RunCmd([]string{"convert"})
        Assert.Equal(2, result.Exit)
    }

    @Fact
    func SingleAsin_SetsExportToAax_True() {
        let exec = UseCapturing()
        let result = RunCmd([]string{"convert", "B00ASIN1", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Single(exec.Requests)
        Assert.True(exec.Requests[0].ExportToAax)
        Assert.Equal("B00ASIN1", exec.Requests[0].Asin)
        Assert.Contains("\"resource\": \"download-summary\"", result.Stdout)
    }

    @Fact
    func OutputDir_Is_Forwarded() {
        let exec = UseCapturing()
        let result = RunCmd([]string{"convert", "B00ASIN1", "--output-dir", "/tmp/out", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Equal("/tmp/out", exec.Requests[0].OutputDir)
    }

    @Fact
    func DownloadCommand_ExportFlag_Aax_SetsExportToAax() {
        let exec = UseCapturing()
        let result = RunCmd([]string{"download", "B00ASIN1", "--export", "aax", "--output-dir", "/tmp/d", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.True(exec.Requests[0].ExportToAax)
        Assert.Equal("/tmp/d", exec.Requests[0].OutputDir)
    }

    @Fact
    func DownloadCommand_ExportFlag_Invalid_ExitsTwo() {
        UseCapturing()
        let result = RunCmd([]string{"download", "B00ASIN1", "--export", "wav"})
        Assert.Equal(2, result.Exit)
        Assert.Contains("--export", result.Stderr)
    }

    @Fact
    func DownloadCommand_NoExportFlag_DefaultsFalse() {
        let exec = UseCapturing()
        let result = RunCmd([]string{"download", "B00ASIN1", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.False(exec.Requests[0].ExportToAax)
    }

    func RunCmd(args []string) E2ECmdResult {
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
            let exit = parse.InvokeAsync().Result
            return E2ECmdResult(exit, sw.ToString(), ew.ToString())
        } finally {
            Console.SetOut(origOut)
            Console.SetError(origErr)
            CliEnvironment.Out = origCliOut
            CliEnvironment.Error = origCliErr
        }
    }
}
