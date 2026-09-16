package Oahu.Cli.Tests.Tui

import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Spectre.Console
import Spectre.Console.Rendering
import Spectre.Console.Testing
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Runtime.CompilerServices
import System.Threading
import System.Threading.Tasks
import Xunit

@Collection("EnvVarSerial")
class QueueScreenTests : IDisposable {
    private let tempFile string

    init() {
        Theme.Reset()
        tempFile = Path.Combine(Path.GetTempPath(), "oahu-cli-queue-${Guid.NewGuid():n}.json")
    }

    func Dispose() {
        Theme.Reset()
        if File.Exists(tempFile) {
            File.Delete(tempFile)
        }
    }

    private func NewScreen(q IQueueService, j IJobService? = nil) QueueScreen -> QueueScreen(
        () -> q,
        () -> j ?? FakeJobService()
    )

    @Fact
    async func OnActivated_Loads_Entries() {
        let q = InMemoryQueueService()
        await q.AddAsync(E("A1"))
        await q.AddAsync(E("A2"))
        let s = NewScreen(q)
        await WaitForLoad(s, NullNavigator())
        Assert.Equal(2, s.Entries.Count)
        Assert.Equal([]string{"A1", "A2"}, s.Entries.Select((e QueueEntry) -> e.Asin).ToArray())
    }

    @Fact
    async func ShiftDown_Moves_Cursor_Entry_Down() {
        let q = InMemoryQueueService()
        await q.AddAsync(E("A1"))
        await q.AddAsync(E("A2"))
        await q.AddAsync(E("A3"))
        let s = NewScreen(q)
        await WaitForLoad(s, NullNavigator())
        Assert.True(s.HandleKey(Key('\u0000', ConsoleKey.DownArrow, ConsoleModifiers.Shift)))
        for var i = 0; i < 50 && s.NeedsTimedRefresh; i++ {
            await Task.Delay(20)
        }
        Assert.Equal([]string{"A2", "A1", "A3"}, (await q.ListAsync()).Select((e QueueEntry) -> e.Asin).ToArray())
        Assert.Equal(1, s.Cursor)
    }

    @Fact
    async func X_Removes_Selected_Entry() {
        let q = InMemoryQueueService()
        await q.AddAsync(E("A1"))
        await q.AddAsync(E("A2"))
        let s = NewScreen(q)
        await WaitForLoad(s, NullNavigator())
        Assert.True(s.HandleKey(Key('x', ConsoleKey.X)))
        for var i = 0; i < 50 && s.NeedsTimedRefresh; i++ {
            await Task.Delay(20)
        }
        Assert.Single(s.Entries)
        Assert.Equal("A2", s.Entries[0].Asin)
    }

    @Fact
    async func Enter_Submits_And_Removes_Then_Switches_To_Jobs() {
        let q = InMemoryQueueService()
        await q.AddAsync(E("A1"))
        let fakeJob = FakeJobService()
        let nav = NullNavigator()
        let s = NewScreen(q, fakeJob)
        await WaitForLoad(s, nav)
        Assert.True(s.HandleKey(Key('\r', ConsoleKey.Enter)))
        for var i = 0; i < 50 && s.NeedsTimedRefresh; i++ {
            await Task.Delay(20)
        }
        Assert.Single(fakeJob.Submitted)
        Assert.Equal("A1", fakeJob.Submitted[0].Asin)
        Assert.Empty(await q.ListAsync())
        Assert.Equal('4', nav.LastSwitch)
    }

    shared {
        private func E(asin string, title string? = nil) QueueEntry -> QueueEntry{
            Asin: asin,
            Title: title ?? "Book $asin"
        }

        private async func WaitForLoad(s QueueScreen, nav NullNavigator) {
            // OnActivatedAsync returns the load task; await it directly.
            let task Task? = s.OnActivatedAsync(nav)
            if task != nil {
                await task
            }
        }

        private func Key(
            ch char,
            k ConsoleKey,
            mod ConsoleModifiers = ConsoleModifiers.None
        ) ConsoleKeyInfo -> ConsoleKeyInfo(
            ch,
            k,
            shift: (mod & ConsoleModifiers.Shift) != 0,
            alt: (mod & ConsoleModifiers.Alt) != 0,
            control: (mod & ConsoleModifiers.Control) != 0
        )
    }
}

class JobsScreenTests {
    @Fact
    func Seeds_From_ListActive_On_Activation() {
        let fake = FakeJobService()
        fake.SeedActive(
            JobSnapshot{
                JobId: "j1",
                Asin: "A1",
                Title: "Hello",
                Phase: JobPhase.Downloading,
                Progress: 0.42,
                StartedAt: DateTimeOffset.UtcNow,
                UpdatedAt: DateTimeOffset.UtcNow
            }
        )
        let s = JobsScreen(
            func () IJobService {
                return fake
            }
        )
        s.OnActivated(NullNavigator())
        Assert.Single(s.Snapshots)
        Assert.Equal("Hello", s.Snapshots[0].Title)
        s.OnDeactivated()
    }

    @Fact
    func Cancel_Key_Calls_JobService_Cancel() {
        let fake = FakeJobService()
        fake.SeedActive(
            JobSnapshot{
                JobId: "j1",
                Asin: "A1",
                Title: "Hello",
                Phase: JobPhase.Downloading,
                StartedAt: DateTimeOffset.UtcNow,
                UpdatedAt: DateTimeOffset.UtcNow
            }
        )
        let s = JobsScreen(
            func () IJobService {
                return fake
            }
        )
        s.OnActivated(NullNavigator())
        s.HandleKey(ConsoleKeyInfo('c', ConsoleKey.C, false, false, false))
        Assert.Equal([]string{"j1"}, fake.Canceled.ToArray())
        s.OnDeactivated()
    }

    @Fact
    func Terminal_Sequence_Is_Clear_When_No_Active() {
        let s = JobsScreen(
            func () IJobService {
                return FakeJobService()
            }
        )
        s.OnActivated(NullNavigator())
        Assert.Equal(AppShell.TerminalProgressClearSequence, s.GetTerminalProgressSequence())
        s.OnDeactivated()
    }

    @Fact
    func Terminal_Sequence_Reports_Aggregate_Progress() {
        let fake = FakeJobService()
        fake.SeedActive(
            JobSnapshot{
                JobId: "a",
                Asin: "A1",
                Title: "T1",
                Phase: JobPhase.Downloading,
                Progress: 0.5,
                StartedAt: DateTimeOffset.UtcNow,
                UpdatedAt: DateTimeOffset.UtcNow
            }
        )
        let s = JobsScreen(
            func () IJobService {
                return fake
            }
        )
        s.OnActivated(NullNavigator())
        let seq = s.GetTerminalProgressSequence()
        Assert.StartsWith("\u001B]9;4;1;", seq)
        Assert.EndsWith("\u001B\\", seq)
        s.OnDeactivated()
    }
}

class HistoryScreenTests {
    @Fact
    async func OnActivated_Loads_Records_Newest_First() {
        let older = JobRecord{
            Id: "j1",
            Asin: "A1",
            Title: "Old",
            TerminalPhase: JobPhase.Completed,
            StartedAt: DateTimeOffset.UtcNow.AddHours(-2),
            CompletedAt: DateTimeOffset.UtcNow.AddHours(-2)
        }
        let newer = older with{Id = "j2", Asin = "A2", Title = "New", CompletedAt = DateTimeOffset.UtcNow}
        let fake = FakeJobService()
        fake.SeedHistory(older, newer)
        let s = HistoryScreen(
            func () IJobService {
                return fake
            }
        )
        let task Task? = s.OnActivatedAsync(NullNavigator())
        if task != nil {
            await task
        }
        Assert.Equal(2, s.Records.Count)
        Assert.Equal("New", s.Records[0].Title)
        Assert.Equal("Old", s.Records[1].Title)
    }

    @Fact
    async func R_Resubmits_Selected_Record() {
        let rec = JobRecord{
            Id: "j1",
            Asin: "A1",
            Title: "Book",
            TerminalPhase: JobPhase.Failed,
            StartedAt: DateTimeOffset.UtcNow,
            CompletedAt: DateTimeOffset.UtcNow,
            Quality: DownloadQuality.High
        }
        let fake = FakeJobService()
        fake.SeedHistory(rec)
        let nav = NullNavigator()
        let s = HistoryScreen(fake.AsFactory())
        let task Task? = s.OnActivatedAsync(nav)
        if task != nil {
            await task
        }
        Assert.True(s.HandleKey(ConsoleKeyInfo('r', ConsoleKey.R, false, false, false)))
        for var i = 0; i < 50 && fake.Submitted.Count == 0; i++ {
            await Task.Delay(20)
        }
        Assert.Single(fake.Submitted)
        Assert.Equal("A1", fake.Submitted[0].Asin)
        Assert.Equal('4', nav.LastSwitch)
    }
}

@Collection("EnvVarSerial")
class AppShellLifecycleTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() -> Theme.Reset()

    @Fact
    func Switching_Tabs_Calls_OnDeactivated_And_OnActivated() {
        let t1 = LifecycleTabScreen("One", '1')
        let t2 = LifecycleTabScreen("Two", '2')
        let c = TestConsole{EmitAnsiSequences: false}
        let shell = AppShell(c, AppShellOptions{Tabs: []ITabScreen{t1, t2}})
        shell.SwitchToTab('2')
        Assert.Equal(1, t1.DeactivatedCount)
        Assert.Equal(1, t2.ActivatedCount)
        shell.SwitchToTab('1')
        Assert.Equal(1, t2.DeactivatedCount)
        Assert.Equal(1, t1.ActivatedCount)
    }

    @Fact
    func ShowToast_Sets_Toast_Message() {
        let c = TestConsole{EmitAnsiSequences: false}
        let t = LifecycleTabScreen("One", '1')
        let shell = AppShell(c, AppShellOptions{Tabs: []ITabScreen{t}})
        // No throw, no public surface — just exercise the call path.
        shell.ShowToast("hello")
    }
}

internal class NullNavigator : IAppShellNavigator {
    prop LastSwitch char? {
        get;
        private set;
    }

    prop LastModal IModal? {
        get;
        private set;
    }

    prop LastToast string? {
        get;
        private set;
    }

    prop DismissCalled bool {
        get;
        private set;
    }

    prop LastBroker TuiCallbackBroker? {
        get;
        private set;
    }

    prop LastTrackedLoad Task? {
        get;
        private set;
    }

    prop ActiveModal IModal? -> LastModal
    func SwitchToTab(numberKey char) -> LastSwitch = numberKey

    func ShowModal(modal IModal) -> LastModal = modal

    func ShowToast(message string) -> LastToast = message

    func DismissModal() {
        DismissCalled = true
        LastModal = nil
    }

    func SetBroker(broker TuiCallbackBroker?) -> LastBroker = broker

    func TrackLoad(loadTask Task) -> LastTrackedLoad = loadTask
}

internal class LifecycleTabScreen : ITabScreen {
    init(title string, numberKey char) {
        Title = title
        NumberKey = numberKey
    }

    prop Title string {
        get;
        init;
    }

    prop NumberKey char {
        get;
        init;
    }

    prop Hints IEnumerable[KeyValuePair[string, string?]] -> Array.Empty[KeyValuePair[string, string?]]()

    prop ActivatedCount int32 {
        get;
        private set;
    }

    prop DeactivatedCount int32 {
        get;
        private set;
    }

    prop ShutdownCount int32 {
        get;
        private set;
    }

    func Render(width int32, height int32) IRenderable -> Markup(Title)

    func HandleKey(key ConsoleKeyInfo) bool -> false

    func OnActivated(navigator IAppShellNavigator) {
        ActivatedCount++
    }

    func OnDeactivated() {
        DeactivatedCount++
    }

    func OnShutdown() {
        ShutdownCount++
    }
}

internal class FakeJobService : IJobService {
    init() {
        Submitted = List[JobRequest]()
        Canceled = List[string]()
    }

    private let active List[JobSnapshot] = List[JobSnapshot]()
    private let history List[JobRecord] = List[JobRecord]()

    prop Submitted List[JobRequest] {
        get;
        init;
    }

    prop Canceled List[string] {
        get;
        init;
    }

    func SeedActive(s ...JobSnapshot) -> active.AddRange(s)

    func SeedHistory(r ...JobRecord) -> history.AddRange(r)

    func AsFactory()() -> IJobService -> () -> this

    func SubmitAsync(request JobRequest, ct CancellationToken = default(CancellationToken)) Task {
        Submitted.Add(request)
        return Task.CompletedTask
    }

    async func ObserveAll(
        @System.Runtime.CompilerServices.EnumeratorCancellation ct CancellationToken = default(CancellationToken)
    ) IAsyncEnumerable[JobUpdate] {
        await Task.CompletedTask
        yield break
    }

    async func ObserveAsync(
        jobId string,
        @System.Runtime.CompilerServices.EnumeratorCancellation ct CancellationToken = default(CancellationToken)
    ) IAsyncEnumerable[JobUpdate] {
        await Task.CompletedTask
        yield break
    }

    func Cancel(jobId string) bool {
        Canceled.Add(jobId)
        return true
    }

    func GetSnapshot(jobId string) JobSnapshot? -> active.FirstOrDefault((s JobSnapshot) -> s.JobId == jobId)

    func ListActive() IReadOnlyList[JobSnapshot] -> active.ToArray()

    async func ReadHistoryAsync(
        @System.Runtime.CompilerServices.EnumeratorCancellation ct CancellationToken = default(CancellationToken)
    ) IAsyncEnumerable[JobRecord] {
        for r in history {
            yield r
        }
        await Task.CompletedTask
    }
}
