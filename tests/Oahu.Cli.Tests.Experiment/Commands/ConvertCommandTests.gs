// G# port of Commands/ConvertCommandTests.cs — PARTIAL for 0.1.509.
// CapturingExecutor (IJobExecutor with async yield) triggers GS9998 ICE.
// Using FakeJobExecutor instead; tests that assert on captured Requests are skipped.
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
type ConvertCommandTests class : IDisposable {
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

    func UseScheduler() {
        var exec = FakeJobExecutor(TimeSpan.FromMilliseconds(1))
        var sched = JobScheduler(exec)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = func() IJobService { return sched }
    }

    @Fact
    func NoArgs_ExitsTwo() {
        UseScheduler()
        var result = ConvertRunCmd([]string{"convert"})
        Assert.Equal(2, result.Exit)
    }

    @Fact
    func SingleAsin_ExitsZero_EmitsSummary() {
        UseScheduler()
        var result = ConvertRunCmd([]string{"convert", "B00ASIN1", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Contains("\"resource\": \"download-summary\"", result.Stdout)
    }

    @Fact
    func DownloadCommand_ExportFlag_Invalid_ExitsTwo() {
        UseScheduler()
        var result = ConvertRunCmd([]string{"download", "B00ASIN1", "--export", "wav"})
        Assert.Equal(2, result.Exit)
        Assert.Contains("--export", result.Stderr)
    }

    // Tests that assert on CapturingExecutor.Requests (SingleAsin_SetsExportToAax_True,
    // OutputDir_Is_Forwarded, DownloadCommand_ExportFlag_Aax_SetsExportToAax,
    // DownloadCommand_NoExportFlag_DefaultsFalse) are SKIPPED because CapturingExecutor
    // (async yield implementing IJobExecutor) triggers GS9998 ICE.

    func ConvertRunCmd(args []string) E2ECmdResult {
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
