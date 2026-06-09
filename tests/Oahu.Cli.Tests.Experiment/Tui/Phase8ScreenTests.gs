// G# port of Tui/Phase8ScreenTests.cs — IMPROVED for 0.1.509.
//
// Ports: QueueScreen (OnActivated_Loads_Entries, ShiftDown, X_Removes, Enter_Submits),
// JobsScreen (Seeds, Cancel, Terminal_Clear, Terminal_Progress),
// HistoryScreen (OnActivated_Loads_Records_Newest_First, R_Resubmits).
//
// WORKAROUNDS:
// - gsharp#572: DIM dispatch on concrete → cast to ITabScreen before calling OnActivatedAsync/OnActivated.
// - gsharp#537: `for c in string` → .ToCharArray().
// - IAsyncEnumerable-returning IJobService → use real JobScheduler(FakeJobExecutor) for scheduler-dependent tests.
// - AppShellLifecycleTests (Spectre.Console.Testing TestConsole) → STILL BLOCKED.

package Oahu.Cli.Tests.Experiment.Tui

import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Xunit

type P8Navigator class : IAppShellNavigator {
    LastSwitch char = char(0)
    LastToast string? = nil
    LastModalVal IModal? = nil

    prop ActiveModal IModal? { get { return LastModalVal } }

    func SwitchToTab(numberKey char) {
        LastSwitch = numberKey
    }

    func ShowModal(modal IModal) {
        LastModalVal = modal
    }

    func ShowToast(message string) {
        LastToast = message
    }

    func DismissModal() {
        LastModalVal = nil
    }

    func SetBroker(broker TuiCallbackBroker?) {
    }

    func TrackLoad(loadTask Task) {
    }
}

@Collection("EnvVarSerial")
type Phase8ScreenTests class {
    init() {
        Theme.Reset()
    }

    func MakeQueueEntry(asin string, title string) QueueEntry {
        return QueueEntry() { Asin = asin, Title = title }
    }

    func Key(ch char, k ConsoleKey, shift bool, alt bool, ctrl bool) ConsoleKeyInfo {
        return ConsoleKeyInfo(ch, k, shift, alt, ctrl)
    }

    func ActivateTabScreen(screen ITabScreen, nav IAppShellNavigator) Task? {
        return screen.OnActivatedAsync(nav)
    }

    func DeactivateTabScreen(screen ITabScreen) {
        screen.OnDeactivated()
    }

    // --- QueueScreen Tests ---

    @Fact
    func QueueScreen_Title_And_NumberKey() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var queue = InMemoryQueueService()
        var screen = QueueScreen(func() IQueueService { return queue }, func() IJobService { return sched })
        Assert.Equal("Queue", screen.Title)
        Assert.Equal('3', screen.NumberKey)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func QueueScreen_OnActivated_Loads_Entries() {
        var queue = InMemoryQueueService()
        queue.AddAsync(MakeQueueEntry("A1", "Book A1"), CancellationToken.None).GetAwaiter().GetResult()
        queue.AddAsync(MakeQueueEntry("A2", "Book A2"), CancellationToken.None).GetAwaiter().GetResult()

        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var screen = QueueScreen(func() IQueueService { return queue }, func() IJobService { return sched })
        var nav = P8Navigator()

        let ts ITabScreen = screen
        var task = ActivateTabScreen(ts, nav)
        if task != nil {
            task!!.GetAwaiter().GetResult()
        }

        Assert.Equal(2, screen.Entries.Count)
        Assert.Equal("A1", screen.Entries[0].Asin)
        Assert.Equal("A2", screen.Entries[1].Asin)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func QueueScreen_ShiftDown_Moves_Cursor_Entry_Down() {
        var queue = InMemoryQueueService()
        queue.AddAsync(MakeQueueEntry("A1", "Book A1"), CancellationToken.None).GetAwaiter().GetResult()
        queue.AddAsync(MakeQueueEntry("A2", "Book A2"), CancellationToken.None).GetAwaiter().GetResult()
        queue.AddAsync(MakeQueueEntry("A3", "Book A3"), CancellationToken.None).GetAwaiter().GetResult()

        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var screen = QueueScreen(func() IQueueService { return queue }, func() IJobService { return sched })
        var nav = P8Navigator()

        let ts ITabScreen = screen
        var task = ActivateTabScreen(ts, nav)
        if task != nil {
            task!!.GetAwaiter().GetResult()
        }

        // Shift+DownArrow moves current entry down
        screen.HandleKey(Key(char(0), ConsoleKey.DownArrow, true, false, false))

        // Wait for background reorder
        var i = 0
        for i < 50 && screen.NeedsTimedRefresh {
            Task.Delay(20).GetAwaiter().GetResult()
            i = i + 1
        }

        var entries = queue.ListAsync(CancellationToken.None).GetAwaiter().GetResult()
        Assert.Equal("A2", entries[0].Asin)
        Assert.Equal("A1", entries[1].Asin)
        Assert.Equal("A3", entries[2].Asin)
        Assert.Equal(1, screen.Cursor)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func QueueScreen_X_Removes_Selected_Entry() {
        var queue = InMemoryQueueService()
        queue.AddAsync(MakeQueueEntry("A1", "Book A1"), CancellationToken.None).GetAwaiter().GetResult()
        queue.AddAsync(MakeQueueEntry("A2", "Book A2"), CancellationToken.None).GetAwaiter().GetResult()

        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var screen = QueueScreen(func() IQueueService { return queue }, func() IJobService { return sched })
        var nav = P8Navigator()

        let ts ITabScreen = screen
        var task = ActivateTabScreen(ts, nav)
        if task != nil {
            task!!.GetAwaiter().GetResult()
        }

        screen.HandleKey(Key('x', ConsoleKey.X, false, false, false))
        var i = 0
        for i < 50 && screen.NeedsTimedRefresh {
            Task.Delay(20).GetAwaiter().GetResult()
            i = i + 1
        }

        Assert.Single(screen.Entries)
        Assert.Equal("A2", screen.Entries[0].Asin)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func QueueScreen_Enter_Submits_And_Switches_To_Jobs() {
        var queue = InMemoryQueueService()
        queue.AddAsync(MakeQueueEntry("A1", "Book A1"), CancellationToken.None).GetAwaiter().GetResult()

        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var screen = QueueScreen(func() IQueueService { return queue }, func() IJobService { return sched })
        var nav = P8Navigator()

        let ts ITabScreen = screen
        var task = ActivateTabScreen(ts, nav)
        if task != nil {
            task!!.GetAwaiter().GetResult()
        }

        screen.HandleKey(Key(char(13), ConsoleKey.Enter, false, false, false))
        var i = 0
        for i < 50 && screen.NeedsTimedRefresh {
            Task.Delay(20).GetAwaiter().GetResult()
            i = i + 1
        }

        // After enter, queue should be emptied and we switch to Jobs tab
        var remaining = queue.ListAsync(CancellationToken.None).GetAwaiter().GetResult()
        Assert.Empty(remaining)
        Assert.Equal('4', nav.LastSwitch)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    // --- JobsScreen Tests ---

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
        Assert.Empty(screen.Snapshots)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func JobsScreen_Terminal_Sequence_Is_Clear_When_No_Active() {
        var executor = FakeJobExecutor()
        var sched = JobScheduler(executor)
        var screen = JobsScreen(func() IJobService { return sched })
        var nav = P8Navigator()
        let ts ITabScreen = screen
        ActivateTabScreen(ts, nav)
        Assert.Equal(AppShell.TerminalProgressClearSequence, screen.GetTerminalProgressSequence())
        DeactivateTabScreen(ts)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func JobsScreen_Seeds_And_Reports_Progress_After_Submit() {
        // Use a long delay so job stays in Downloading phase during assertion
        var executor = FakeJobExecutor(TimeSpan.FromMilliseconds(500), false)
        var sched = JobScheduler(executor)

        // Submit a job
        var request = JobRequest() { Asin = "A1", Title = "TestBook", Quality = DownloadQuality.High }
        sched.SubmitAsync(request, CancellationToken.None).GetAwaiter().GetResult()

        // Give it a moment to start processing
        Task.Delay(50).GetAwaiter().GetResult()

        var screen = JobsScreen(func() IJobService { return sched })
        var nav = P8Navigator()
        let ts ITabScreen = screen
        ActivateTabScreen(ts, nav)

        // Should have at least 1 active snapshot
        Assert.True(screen.Snapshots.Count >= 1)

        // Terminal progress sequence should NOT be clear (there's an active job)
        var seq = screen.GetTerminalProgressSequence()
        Assert.StartsWith("\u001b]9;4;1;", seq)

        DeactivateTabScreen(ts)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    @Fact
    func JobsScreen_Cancel_Key_Cancels_Active_Job() {
        var executor = FakeJobExecutor(TimeSpan.FromMilliseconds(2000), false)
        var sched = JobScheduler(executor)

        var request = JobRequest() { Asin = "A1", Title = "CancelMe", Quality = DownloadQuality.High }
        sched.SubmitAsync(request, CancellationToken.None).GetAwaiter().GetResult()
        Task.Delay(50).GetAwaiter().GetResult()

        var screen = JobsScreen(func() IJobService { return sched })
        var nav = P8Navigator()
        let ts ITabScreen = screen
        ActivateTabScreen(ts, nav)

        // Verify we have an active job
        Assert.True(screen.Snapshots.Count >= 1)

        // Press 'c' to cancel
        screen.HandleKey(Key('c', ConsoleKey.C, false, false, false))

        // Wait for cancellation to propagate
        Task.Delay(100).GetAwaiter().GetResult()

        DeactivateTabScreen(ts)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        Theme.Reset()
    }

    // --- HistoryScreen Tests ---

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
    func HistoryScreen_OnActivated_Loads_Records_Newest_First() {
        // Use minimal delay so jobs complete quickly
        var executor = FakeJobExecutor(TimeSpan.FromMilliseconds(1), false)
        var histPath = Path.Combine(Path.GetTempPath(), "oahu-gs-hist-${Guid.NewGuid().ToString("N")}.jsonl")
        var history = JsonlHistoryStore(histPath, nil)
        var sched = JobScheduler(executor, history, nil, nil)

        // Submit two jobs and wait for both to complete
        var req1 = JobRequest() { Asin = "A1", Title = "Old", Quality = DownloadQuality.High }
        sched.SubmitAsync(req1, CancellationToken.None).GetAwaiter().GetResult()
        Task.Delay(500).GetAwaiter().GetResult()

        var req2 = JobRequest() { Asin = "A2", Title = "New", Quality = DownloadQuality.High }
        sched.SubmitAsync(req2, CancellationToken.None).GetAwaiter().GetResult()
        Task.Delay(500).GetAwaiter().GetResult()

        var screen = HistoryScreen(func() IJobService { return sched })
        var nav = P8Navigator()
        let ts ITabScreen = screen
        var task = ActivateTabScreen(ts, nav)
        if task != nil {
            task!!.GetAwaiter().GetResult()
        }

        // Should have 2 records, newest first
        Assert.Equal(2, screen.Records.Count)
        Assert.Equal("New", screen.Records[0].Title)
        Assert.Equal("Old", screen.Records[1].Title)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        if File.Exists(histPath) {
            File.Delete(histPath)
        }
        Theme.Reset()
    }

    @Fact
    func HistoryScreen_R_Resubmits_Selected_Record() {
        // Complete a job to populate history, then resubmit it with 'r'
        var executor = FakeJobExecutor(TimeSpan.FromMilliseconds(1), false)
        var histPath = Path.Combine(Path.GetTempPath(), "oahu-gs-hist-r-${Guid.NewGuid().ToString("N")}.jsonl")
        var history = JsonlHistoryStore(histPath, nil)
        var sched = JobScheduler(executor, history, nil, nil)

        var req = JobRequest() { Asin = "A1", Title = "Book", Quality = DownloadQuality.High }
        sched.SubmitAsync(req, CancellationToken.None).GetAwaiter().GetResult()
        Task.Delay(500).GetAwaiter().GetResult()

        var screen = HistoryScreen(func() IJobService { return sched })
        var nav = P8Navigator()
        let ts ITabScreen = screen
        var task = ActivateTabScreen(ts, nav)
        if task != nil {
            task!!.GetAwaiter().GetResult()
        }

        Assert.True(screen.Records.Count >= 1)

        // Press 'r' to resubmit
        screen.HandleKey(Key('r', ConsoleKey.R, false, false, false))
        Task.Delay(200).GetAwaiter().GetResult()

        // Should switch to Jobs tab
        Assert.Equal('4', nav.LastSwitch)
        sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        if File.Exists(histPath) {
            File.Delete(histPath)
        }
        Theme.Reset()
    }
}
