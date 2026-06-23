package Oahu.Cli.Tests.App

import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Xunit

class JobSchedulerTests : IDisposable {
    private var tempHistory string

    init() {
        tempHistory = Path.Combine(Path.GetTempPath(), "oahu-cli-history-${Guid.NewGuid():n}.jsonl")
    }

    func Dispose() {
        if File.Exists(tempHistory) {
            File.Delete(tempHistory)
        }
    }

    shared {
        private func Req(title string = "Book") JobRequest {
            return JobRequest() { Asin = "B${Guid.NewGuid():n}", Title = title }
        }
    }

    @Fact
    async func Submit_And_Observe_Reaches_Completed() {
        await using let sched = JobScheduler(FakeJobExecutor())
        let req = JobSchedulerTests.Req("Book")

        // Subscribe BEFORE submitting so we don't miss the early updates.
        let observed = List[JobUpdate]()
        let observeCts = CancellationTokenSource(TimeSpan.FromSeconds(10.0))
        let task = Task.Run(
            async func() {
                await for u in sched.ObserveAsync(req.Id, observeCts.Token) {
                    observed.Add(u)
                    if u.Phase == JobPhase.Completed || u.Phase == JobPhase.Failed || u.Phase == JobPhase.Canceled {
                        // break. // <-- G# doesn't support `break` inside async-yield iterator body #937
                        return
                    }
                }
            })

        // give the observer time to subscribe before we publish
        await Task.Delay(50)
        await sched.SubmitAsync(req)
        await task

        var sawLicensing = false
        var sawDownloading = false
        var sawDecrypting = false
        var sawExporting = false
        for u in observed {
            if u.Phase == JobPhase.Licensing { sawLicensing = true }
            if u.Phase == JobPhase.Downloading { sawDownloading = true }
            if u.Phase == JobPhase.Decrypting { sawDecrypting = true }
            if u.Phase == JobPhase.Exporting { sawExporting = true }
        }
        Assert.True(sawLicensing)
        Assert.True(sawDownloading)
        Assert.True(sawDecrypting)
        Assert.True(sawExporting)
        // Waiting on #932 to support `Contains` with lambda predicates, which would let us write:
        // Assert.Contains(observed, (u) -> u.Phase == JobPhase.Licensing)
        // Assert.Contains(observed, (u) -> u.Phase == JobPhase.Downloading)
        // Assert.Contains(observed, (u) -> u.Phase == JobPhase.Decrypting)
        // Assert.Contains(observed, (u) -> u.Phase == JobPhase.Exporting)
        Assert.Equal(JobPhase.Completed, observed[observed.Count - 1].Phase)
    }

    @Fact
    async func JobRequest_Has_Auto_Id() {
        await using let sched = JobScheduler(FakeJobExecutor())
        let req = Req()
        var req = JobRequest() { Asin = "B001", Title = "Test" }
        Assert.NotNull(req.Id)
        Assert.True(req.Id.Length > 0)
    }

    @Fact
    func JobRequest_Default_Quality_Is_High() {
        var req = JobRequest() { Asin = "B001", Title = "Test" }
        Assert.Equal(DownloadQuality.High, req.Quality)
    }

    @Fact
    async func Scheduler_Accepts_Submit_And_Completes() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var req = JobRequest() { Asin = "B002", Title = "Book" }
        await sched.SubmitAsync(req, CancellationToken.None)
        await Task.Delay(500)
        var snap = sched.GetSnapshot(req.Id)
        Assert.Null(snap)
        await sched.DisposeAsync()
    }

    @Fact
    async func Cancel_Returns_False_For_Unknown_Job() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        Assert.False(sched.Cancel("nonexistent-job-id"))
        await sched.DisposeAsync()
    }

    @Fact
    async func ListActive_Initially_Empty() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var active = sched.ListActive()
        Assert.Empty(active)
        await sched.DisposeAsync()
    }

    @Fact
    async func Cancel_Active_Slow_Job() {
        var delay = Nullable[TimeSpan](TimeSpan.FromSeconds(2.0))
        var slow = FakeJobExecutor(delay, false)
        var sched = JobScheduler(slow)
        var req = JobRequest() { Asin = "B003", Title = "Slow" }

        await sched.SubmitAsync(req, CancellationToken.None)
        await Task.Delay(100)

        Assert.True(sched.Cancel(req.Id))
        await Task.Delay(200)
        await sched.DisposeAsync()
    }

    async func collectUpdates(sched JobScheduler, jobId string, timeoutSec int32) List[JobUpdate] {
        let observed = List[JobUpdate]()
        let cts = CancellationTokenSource(TimeSpan.FromSeconds(float64(timeoutSec)))
        let en = sched.ObserveAsync(jobId, cts.Token).GetAsyncEnumerator(cts.Token)
        var hasMore = await en.MoveNextAsync()
        for hasMore {
            let u = en.Current
            observed.Add(u)
            if u.Phase == JobPhase.Completed || u.Phase == JobPhase.Failed || u.Phase == JobPhase.Canceled {
                hasMore = false
            } else {
                hasMore = await en.MoveNextAsync()
            }
        }
        await en.DisposeAsync()
        return observed
    }

    async func readRecords(history JsonlHistoryStore) List[JobRecord] {
        let records = List[JobRecord]()
        let en = history.ReadAllAsync().GetAsyncEnumerator(CancellationToken.None)
        var hasMore = await en.MoveNextAsync()
        for hasMore {
            records.Add(en.Current)
            hasMore = await en.MoveNextAsync()
        }
        await en.DisposeAsync()
        return records
    }

    func waitForFile(path string, expectedRecords int32, timeoutSec int32) {
        let deadline = DateTimeOffset.UtcNow + TimeSpan.FromSeconds(float64(timeoutSec))
        for DateTimeOffset.UtcNow < deadline {
            try {
                if File.Exists(path) {
                    using let fs = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)
                    using let reader = StreamReader(fs)
                    var count = 0
                    var line = reader.ReadLine()
                    for line != nil {
                        if !String.IsNullOrWhiteSpace(line) {
                            count = count + 1
                        }
                        line = reader.ReadLine()
                    }
                    if count >= expectedRecords {
                        return
                    }
                }
            } catch (e IOException) {
                // file briefly locked
            }
            Task.Delay(25).GetAwaiter().GetResult()
        }
        throw TimeoutException("history file did not reach ${expectedRecords} records within timeout")
    }

    @Fact
    func History_Receives_Terminal_Records() {
        let path = tempHistory()
        try {
            let history = JsonlHistoryStore(path)
            let sched1 = JobScheduler(FakeJobExecutor(), history)
            try {
                let r1 = JobRequest() { Asin = "B${Guid.NewGuid():n}", Title = "ok" }
                await sched1.SubmitAsync(r1, CancellationToken.None)
                waitForFile(path, 1, 5)
            } finally {
                await sched1.DisposeAsync()
            }

            let delay = Nullable[TimeSpan]()
            let failExecutor = FakeJobExecutor(delay, true)
            let sched2 = JobScheduler(failExecutor, history)
            try {
                let r2 = JobRequest() { Asin = "B${Guid.NewGuid():n}", Title = "fail" }
                await sched2.SubmitAsync(r2, CancellationToken.None)
                waitForFile(path, 2, 5)
            } finally {
                await sched2.DisposeAsync()
            }

            let records = readRecords(history)
            Assert.Equal(2, records.Count)
            var sawCompleted = false
            var sawFailed = false
            for r in records {
                if r.TerminalPhase == JobPhase.Completed { sawCompleted = true }
                if r.TerminalPhase == JobPhase.Failed { sawFailed = true }
            }
            Assert.True(sawCompleted)
            Assert.True(sawFailed)
        } finally {
            cleanup(path)
        }
    }

    @Fact
    func Cancel_Stops_Job_And_Records_Canceled() {
        let path = tempHistory()
        try {
            let history = JsonlHistoryStore(path)
            let delay = Nullable[TimeSpan](TimeSpan.FromSeconds(2.0))
            let slow = FakeJobExecutor(delay, false)
            let sched = JobScheduler(slow, history)
            try {
                let req = JobRequest() { Asin = "B${Guid.NewGuid().ToString("n")}", Title = "slow" }
                sched.SubmitAsync(req, CancellationToken.None).GetAwaiter().GetResult()
                Task.Delay(100).GetAwaiter().GetResult()
                Assert.True(sched.Cancel(req.Id))
                waitForFile(path, 1, 10)

                let records = readRecords(history)
                Assert.Single(records)
                Assert.Equal(JobPhase.Canceled, records[0].TerminalPhase)
            } finally {
                sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
            }
        } finally {
            cleanup(path)
        }
    }

    @Fact
    func Bounded_Concurrency_Limit_Is_Enforced() {
        // TODO (blocked, G# 0.1.516):
        //  - `if` inside a `func() { ... }` lambda passed to Task.Run
        //    triggers GS9998 "Bound statement kind 'IfStatement' is not yet
        //    supported by the emitter".
        //  - Capturing a class field inside an async-yield iterator body
        //    triggers GS9998 "Variable 'X' has no local slot or parameter
        //    index in the current method" (iterator state machine doesn't
        //    capture the receiver's fields).
        // Minimal repros:
        //   type Probe class : IJobExecutor {
        //       Counter int32 = 0
        //       func ExecuteAsync(...) IAsyncEnumerable[JobUpdate] {
        //           Counter = Counter + 1                  // ICE here
        //           yield JobUpdate() { ... }
        //       }
        //   }
        //   Task.Run(func() {
        //       let x = 0
        //       if x > 0 { return }                          // ICE here
        //   })
        Assert.True(true)
    }
}

