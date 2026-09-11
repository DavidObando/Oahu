package Oahu.Cli.Tests.App

import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Runtime.CompilerServices
import System.Threading
import System.Threading.Tasks
import Xunit

class JobSchedulerTests : IDisposable {
    private let tempHistory string

    init() {
        tempHistory = Path.Combine(Path.GetTempPath(), "oahu-cli-history-${Guid.NewGuid():n}.jsonl")
    }

    func Dispose() {
        if File.Exists(tempHistory) {
            File.Delete(tempHistory)
        }
    }

    @Fact
    async func Submit_And_Observe_Reaches_Completed() {
        await using let sched = JobScheduler(FakeJobExecutor())
        let req = Req()
        let observed = List[JobUpdate]()
        let observeCts = CancellationTokenSource(TimeSpan.FromSeconds(10))
        let task = Task.Run(
            async () -> {
                await for u in sched.ObserveAsync(req.Id, observeCts.Token) {
                    observed.Add(u)
                    if (u.Phase is JobPhase.Completed or JobPhase.Failed or JobPhase.Canceled) {
                        break
                    }
                }
            }
        )
        await Task.Delay(50) // give the observer time to subscribe before we publish
        await sched.SubmitAsync(req)
        await task
        Assert.Contains(observed, (u JobUpdate) -> u.Phase == JobPhase.Licensing)
        Assert.Contains(observed, (u JobUpdate) -> u.Phase == JobPhase.Downloading)
        Assert.Contains(observed, (u JobUpdate) -> u.Phase == JobPhase.Decrypting)
        Assert.Contains(observed, (u JobUpdate) -> u.Phase == JobPhase.Exporting)
        Assert.Equal(JobPhase.Completed, observed[^1].Phase)
    }

    @Fact
    async func History_Receives_Terminal_Records() {
        let history = JsonlHistoryStore(tempHistory)
        {
            await using let sched = JobScheduler(FakeJobExecutor(), history)
            let r1 = Req("ok")
            let r2 = Req("fail")
            // Submit a fail-at-decrypt job by swapping executors; quickest: separate scheduler.
            await sched.SubmitAsync(r1)
            await WaitForFile(tempHistory, expectedRecords: 1)
        }
        {
            await using let failSched = JobScheduler(FakeJobExecutor(failAtDecrypt: true), history)
            await failSched.SubmitAsync(Req("fail"))
            await WaitForFile(tempHistory, expectedRecords: 2)
        }
        let records = List[JobRecord]()
        await for rec in history.ReadAllAsync() {
            records.Add(rec)
        }
        Assert.Equal(2, records.Count)
        Assert.Contains(records, (r JobRecord) -> r.TerminalPhase == JobPhase.Completed)
        Assert.Contains(records, (r JobRecord) -> r.TerminalPhase == JobPhase.Failed)
    }

    @Fact
    async func Cancel_Stops_Job_And_Records_Canceled() {
        let history = JsonlHistoryStore(tempHistory)
        let slow = FakeJobExecutor(delayPerPhase: TimeSpan.FromSeconds(2))
        await using let sched = JobScheduler(slow, history)
        let req = Req("slow")
        await sched.SubmitAsync(req)
        await Task.Delay(100)
        Assert.True(sched.Cancel(req.Id))
        await WaitForFile(tempHistory, expectedRecords: 1, timeout: TimeSpan.FromSeconds(10))
        let records = List[JobRecord]()
        await for rec in history.ReadAllAsync() {
            records.Add(rec)
        }
        Assert.Single(records)
        Assert.Equal(JobPhase.Canceled, records[0].TerminalPhase)
    }

    @Fact
    async func Bounded_Concurrency_Limit_Is_Enforced() {
        // Two parallel workers; submit four jobs; verify peak concurrent in-flight is <= 2.
        var active = 0
        var peak = 0
        let executor = ProbeExecutor(
            onStart: () -> {
                peak = Math.Max(peak, Interlocked.Increment(&active))
            },
            onEnd: () -> Interlocked.Decrement(&active)
        )
        await using let sched = JobScheduler(executor, options: JobSchedulerOptions{MaxParallelism: 2})
        let ids = Enumerable.Range(0, 4).Select((_ int32) -> Req()).ToArray()
        let done = TaskCompletionSource()
        var seenCompletions = 0
        let observeCts = CancellationTokenSource(TimeSpan.FromSeconds(10))
        let _ = Task.Run(
            async () -> {
                await for u in sched.ObserveAll(observeCts.Token) {
                    if u.Phase == JobPhase.Completed && Interlocked.Increment(&seenCompletions) == 4 {
                        done.TrySetResult()
                    }
                }
            }
        )
        await Task.Delay(50)
        for r in ids {
            await sched.SubmitAsync(r)
        }
        await done.Task.WaitAsync(TimeSpan.FromSeconds(10))
        Assert.True(peak <= 2, "peak $peak exceeded MaxParallelism")
    }

    private class ProbeExecutor : IJobExecutor {
        private let onStart() -> void
        private let onEnd() -> void

        init(onStart() -> void, onEnd() -> void) {
            this.onStart = onStart
            this.onEnd = onEnd
        }

        async func ExecuteAsync(
            request JobRequest,
            @System.Runtime.CompilerServices.EnumeratorCancellation cancellationToken CancellationToken
        ) IAsyncEnumerable[JobUpdate] {
            onStart()
            try {
                yield JobUpdate{JobId: request.Id, Phase: JobPhase.Downloading}
                await Task.Delay(150, cancellationToken).ConfigureAwait(false)
                yield JobUpdate{JobId: request.Id, Phase: JobPhase.Completed}
            } finally {
                onEnd()
            }
        }
    }

    shared {
        private func Req(title string = "Book") JobRequest -> JobRequest{Asin: "B${Guid.NewGuid():n}", Title: title}

        private async func WaitForFile(path string, expectedRecords int32, timeout TimeSpan? = nil) {
            let deadline = DateTimeOffset.UtcNow + (timeout ?? TimeSpan.FromSeconds(5))
            while DateTimeOffset.UtcNow < deadline {
                try {
                    if File.Exists(path) {
                        using let fs = FileStream(
                            path,
                            FileMode.Open,
                            FileAccess.Read,
                            FileShare.ReadWrite | FileShare.Delete
                        )
                        using let reader = StreamReader(fs)
                        var count = 0
                        while await reader.ReadLineAsync().ConfigureAwait(false) is string line {
                            if !string.IsNullOrWhiteSpace(line) {
                                count++
                            }
                        }
                        if count >= expectedRecords {
                            return
                        }
                    }
                } catch (IOException) {
                    // file briefly locked by the writer on Windows; retry.

                }
                await Task.Delay(25)
            }
            throw TimeoutException("history file did not reach $expectedRecords records within timeout")
        }
    }
}
