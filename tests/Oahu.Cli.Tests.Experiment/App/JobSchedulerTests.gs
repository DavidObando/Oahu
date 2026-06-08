// G# port of App/JobSchedulerTests.cs (partial).
//
// Tests basic JobScheduler submit and cancel functionality.
//
// WORKAROUNDS:
// - gsharp#568: IAsyncDisposable not supported; use DisposeAsync().AsTask().GetAwaiter().GetResult().
// - gsharp#502: Cannot iterate IAsyncEnumerable.
// - GS9998: FakeJobExecutor with nullable TimeSpan? param triggers ICE in combination with
//   CallbackBrokerTests; use default ctor only.
// - Dropped: History tests (JsonlHistoryStore), observe tests (IAsyncEnumerable),
//   concurrency tests (closures on ref-type fields).

package Oahu.Cli.Tests.Experiment.App

import System
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Xunit

type JobSchedulerTests class {
    @Fact
    func JobRequest_Has_Auto_Id() {
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
    func Scheduler_Accepts_Submit_And_Completes() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var req = JobRequest() { Asin = "B002", Title = "Book" }
        sched.SubmitAsync(req, CancellationToken.None).GetAwaiter().GetResult()
        // Wait for completion
        Task.Delay(500).GetAwaiter().GetResult()
        // After fast executor completes, snapshot should be gone
        var snap = sched.GetSnapshot(req.Id)
        Assert.Null(snap)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
    }

    @Fact
    func Cancel_Returns_False_For_Unknown_Job() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        Assert.False(sched.Cancel("nonexistent-job-id"))
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
    }

    @Fact
    func ListActive_Initially_Empty() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var active = sched.ListActive()
        Assert.Empty(active)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
    }

    @Fact
    func Cancel_Active_Slow_Job() {
        var delay = Nullable[TimeSpan](TimeSpan.FromSeconds(2.0))
        var slow = FakeJobExecutor(delay, false)
        var sched = JobScheduler(slow)
        var req = JobRequest() { Asin = "B003", Title = "Slow" }

        sched.SubmitAsync(req, CancellationToken.None).GetAwaiter().GetResult()
        Task.Delay(100).GetAwaiter().GetResult()

        Assert.True(sched.Cancel(req.Id))
        Task.Delay(200).GetAwaiter().GetResult()
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
    }
}
