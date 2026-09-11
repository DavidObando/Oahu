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
import System.Linq
import System.Text.RegularExpressions
import System.Threading
import System.Threading.Tasks
import Xunit

/// End-to-end tests for `oahu-cli history retry`. Drives the root command
/// against a (cref:JobScheduler) backed by (cref:FakeJobExecutor)
/// and a synthetic (cref:JsonlHistoryStore).
@Collection("EnvVarSerial")
class HistoryRetryCommandTests : IDisposable {
    private let tempHistory string
    private let toDispose List[IAsyncDisposable] = List[IAsyncDisposable]()

    init() {
        CliServiceFactory.Reset()
        tempHistory = Path.Combine(Path.GetTempPath(), "oahu-cli-retry-${Guid.NewGuid():n}.jsonl")
    }

    func Dispose() {
        for d in toDispose {
            d.DisposeAsync().AsTask().GetAwaiter().GetResult()
        }
        if File.Exists(tempHistory) {
            File.Delete(tempHistory)
        }
        CliServiceFactory.Reset()
    }

    private func UseScheduler(executor IJobExecutor) {
        let sched = JobScheduler(executor)
        toDispose.Add(sched)
        CliServiceFactory.JobServiceFactory = () -> sched
    }

    private func SeedHistory(records ...JobRecord) {
        let store = JsonlHistoryStore(tempHistory)
        for r in records {
            store.Append(r)
        }
    }

    @Fact
    async func Retry_UnknownId_ExitsOne() {
        UseScheduler(FakeJobExecutor(TimeSpan.FromMilliseconds(1)))
        let (exit, _, stderr) = await RunAsync("history", "retry", "does-not-exist")
        Assert.Equal(1, exit)
        Assert.Contains("no history record", stderr, StringComparison.OrdinalIgnoreCase)
    }

    @Fact
    func JobRecord_Quality_Roundtrips_Through_JsonlHistoryStore() {
        let store = JsonlHistoryStore(tempHistory)
        let rec = JobRecord{
            Id: "abc123",
            Asin: "B0001",
            Title: "Hail Mary",
            TerminalPhase: JobPhase.Completed,
            StartedAt: DateTimeOffset.UtcNow.AddMinutes(-1),
            CompletedAt: DateTimeOffset.UtcNow,
            ProfileAlias: "default",
            Quality: DownloadQuality.Extreme
        }
        store.Append(rec)
        let read = ReadAll(store).Single()
        Assert.Equal(DownloadQuality.Extreme, read.Quality)
        Assert.Equal("abc123", read.Id)
    }

    @Fact
    func JobRecord_Without_Quality_Deserializes_As_Null() {
        // Pre-4c.2 records may lack the "quality" field. Use the live writer
        // to capture the canonical envelope, strip "quality", and re-read.
        let store = JsonlHistoryStore(tempHistory)
        store.Append(
            JobRecord{
                Id: "old1",
                Asin: "B0",
                Title: "T",
                TerminalPhase: JobPhase.Completed,
                StartedAt: DateTimeOffset.Parse("2025-01-01T00:00:00Z"),
                CompletedAt: DateTimeOffset.Parse("2025-01-01T00:01:00Z")
            }
        )
        var raw = File.ReadAllText(tempHistory)
        // The default value of an optional `DownloadQuality?` is `null`, which
        // STJ may emit as `"quality":null`; normalize to "missing field".
        raw = Regex.Replace(raw, ",\\s*\"quality\"\\s*:\\s*null", string.Empty)
        File.WriteAllText(tempHistory, raw)
        let read = ReadAll(store).Single()
        Assert.Null(read.Quality)
    }

    shared {
        private func ReadAll(store JsonlHistoryStore) List[JobRecord] {
            let list = List[JobRecord]()
            let enumerator = store.ReadAllAsync().GetAsyncEnumerator()
            try {
                while enumerator.MoveNextAsync().AsTask().GetAwaiter().GetResult() {
                    list.Add(enumerator.Current)
                }
            } finally {
                enumerator.DisposeAsync().AsTask().GetAwaiter().GetResult()
            }
            return list
        }

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
