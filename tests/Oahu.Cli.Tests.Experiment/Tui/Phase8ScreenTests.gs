// G# port of Tui/Phase8ScreenTests.cs (partial).
//
// Ports: JobsScreen, HistoryScreen, QueueScreen basic tests.
// Skipped: AppShellLifecycleTests (requires Spectre.Console.Testing TestConsole).
// Skipped: Tests requiring OnActivated/OnDeactivated (DIM not resolved by G#).
// Skipped: Async enqueue/submit tests (IAsyncEnumerable in IJobService).
//
// WORKAROUNDS:
// - Default interface methods (OnActivated/OnDeactivated) cannot be called from G#.
// - IJobService has IAsyncEnumerable returns; cannot implement in G#.
//   Use real FakeJobExecutor + JobScheduler from production code instead.

package Oahu.Cli.Tests.Experiment.Tui

import System
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Xunit

@Collection("EnvVarSerial")
type Phase8ScreenTests class {
    init() {
        Theme.Reset()
    }

    @Fact
    func JobsScreen_Title_And_NumberKey() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var screen = JobsScreen(func() IJobService { return sched })
        Assert.Equal("Jobs", screen.Title)
        Assert.Equal('4', screen.NumberKey)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func JobsScreen_No_Active_Snapshots_Initially() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var screen = JobsScreen(func() IJobService { return sched })
        // Before activation, Snapshots should be empty
        Assert.Empty(screen.Snapshots)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func HistoryScreen_Title_And_NumberKey() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var screen = HistoryScreen(func() IJobService { return sched })
        Assert.Equal("History", screen.Title)
        Assert.Equal('5', screen.NumberKey)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func QueueScreen_Title_And_NumberKey() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var queue = Oahu.Cli.App.Queue.InMemoryQueueService()
        var screen = QueueScreen(func() Oahu.Cli.App.Queue.IQueueService { return queue }, func() IJobService { return sched })
        Assert.Equal("Queue", screen.Title)
        Assert.Equal('3', screen.NumberKey)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }
}
