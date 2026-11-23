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
    async func Slow_Observer_Retains_Terminals_After_Progress_Flood() {
        await using let scheduler = JobScheduler(FloodExecutor())
        using let timeout = CancellationTokenSource(TimeSpan.FromSeconds(5))
        let stream = scheduler.ObserveAll(timeout.Token)
        let first = Req("first")
        let second = Req("second")
        await scheduler.SubmitAsync(first)
        await scheduler.SubmitAsync(second)
        while scheduler.ListActive().Count > 0 {
            await Task.Delay(10, timeout.Token)
        }
        let completed = HashSet[string]()
        await for update in stream {
            if update.Phase == JobPhase.Completed {
                completed.Add(update.JobId)
                if completed.Count == 2 { break }
            }
        }
        Assert.Contains(first.Id, completed)
        Assert.Contains(second.Id, completed)
    }

    @Fact
    async func Per_Job_Observer_Completes_After_Terminal() {
        await using let scheduler = JobScheduler(FakeJobExecutor())
        using let timeout = CancellationTokenSource(TimeSpan.FromSeconds(5))
        let request = Req()
        let stream = scheduler.ObserveAsync(request.Id, timeout.Token)
        await scheduler.SubmitAsync(request)
        let phases = List[JobPhase]()
        await for update in stream {
            phases.Add(update.Phase)
        }
        Assert.Equal(JobPhase.Completed, phases[^1])
    }

    @Fact
    async func Dispose_Cancels_Running_And_Queued_Jobs_And_Clears_Recovery_State() {
        let state = tempHistory + ".active"
        let store = JsonlHistoryStore(tempHistory)
        let scheduler = JobScheduler(
            FakeJobExecutor(delayPerPhase: TimeSpan.FromMinutes(1)), store,
            JobSchedulerOptions{ActiveJobsStatePath: state}
        )
        try {
            await scheduler.SubmitAsync(Req("running"))
            await scheduler.SubmitAsync(Req("queued"))
            await scheduler.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(5))
            let records = List[JobRecord]()
            await for record in store.ReadAllAsync() { records.Add(record) }
            Assert.Equal(2, records.Count)
            Assert.All(records, (r JobRecord) -> Assert.Equal(JobPhase.Canceled, r.TerminalPhase))
            Assert.Equal("[]", File.ReadAllText(state).Trim())
        } finally {
            await scheduler.DisposeAsync()
            File.Delete(state)
        }
    }

    @Fact
    async func Completed_Job_Is_Not_Recovered_As_Interrupted_On_Restart() {
        let state = tempHistory + ".active"
        let store = JsonlHistoryStore(tempHistory)
        try {
            {
                await using let scheduler = JobScheduler(
                    FakeJobExecutor(), store, JobSchedulerOptions{ActiveJobsStatePath: state}
                )
                await scheduler.SubmitAsync(Req())
                await WaitForFile(tempHistory, 1)
            }
            {
                await using let restarted = JobScheduler(
                    FakeJobExecutor(), store, JobSchedulerOptions{ActiveJobsStatePath: state}
                )
            }
            let records = List[JobRecord]()
            await for record in store.ReadAllAsync() { records.Add(record) }
            Assert.Single(records)
            Assert.Equal(JobPhase.Completed, records[0].TerminalPhase)
        } finally {
            File.Delete(state)
        }
    }

    @Fact
    async func History_Delete_Does_Not_Lose_Concurrent_Appends() {
        let store = JsonlHistoryStore(tempHistory)
        for var i = 0; i < 200; i++ {
            store.Append(JobRecord{Id: "seed-$i", Asin: "seed-$i", Title: "Seed", TerminalPhase: JobPhase.Completed})
        }
        let delete = Task.Run(async () -> await store.DeleteAsync(keep: 10000))
        let append = Task.Run(() -> {
            for var i = 0; i < 40; i++ {
                store.Append(JobRecord{Id: "added-$i", Asin: "added-$i", Title: "Added", TerminalPhase: JobPhase.Completed})
            }
        })
        await Task.WhenAll(delete, append)
        let records = List[JobRecord]()
        await for record in store.ReadAllAsync() { records.Add(record) }
        Assert.Equal(240, records.Count)
    }

    private class FloodExecutor : IJobExecutor {
        async func ExecuteAsync(request JobRequest, @EnumeratorCancellation cancellationToken CancellationToken) IAsyncEnumerable[JobUpdate] {
            for var i = 0; i < 1000; i++ {
                yield JobUpdate{JobId: request.Id, Phase: JobPhase.Downloading, Progress: float64(i) / 1000.0}
            }
            await Task.Yield()
            yield JobUpdate{JobId: request.Id, Phase: JobPhase.Completed}
        }
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
                let current = Interlocked.Increment(&active)
                var recorded = Volatile.Read(&peak)
                while current > recorded {
                    let previous = Interlocked.CompareExchange(&peak, current, recorded)
                    if previous == recorded {
                        break
                    }
                    recorded = previous
                }
            },
            onEnd: () -> Interlocked.Decrement(&active)
        )
        await using let sched = JobScheduler(executor, options: JobSchedulerOptions{MaxParallelism: 2})
        let ids = Enumerable.Range(0, 4).Select((_ int32) -> Req()).ToArray()
        let done = TaskCompletionSource()
        var seenCompletions = 0
        let observeCts = CancellationTokenSource(TimeSpan.FromSeconds(10))
        let updates = sched.ObserveAll(observeCts.Token)
        let _ = Task.Run(
            async () -> {
                await for u in updates {
                    if u.Phase == JobPhase.Completed && Interlocked.Increment(&seenCompletions) == 4 {
                        done.TrySetResult()
                    }
                }
            }
        )
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
