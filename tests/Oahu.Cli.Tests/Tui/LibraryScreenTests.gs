// G# port of Tui/LibraryScreenTests.cs — IMPROVED for 0.1.459.
//
// Covers: Empty library, JK navigation, Space toggle, A select/deselect,
// Search filter, Esc clears search, Title, Q without QueueService is no-op,
// Q_Enqueues_Selected_Items, Q_With_No_Selection_Enqueues_Cursor_Item,
// OnActivated_Reloads_When_LibraryGeneration_Bumped.
//
// WORKAROUNDS:
// - gsharp#502: async → .GetAwaiter().GetResult().
// - gsharp#573: ActiveModal prop → `prop` accessor.
// - OnActivatedAsync is a DIM → cast to ITabScreen.
// - PendingEnqueue is internal → Thread.Sleep for timing.

package Oahu.Cli.Tests.Tui

import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Xunit

class FakeLibraryService2 : ILibraryService {
    prop Items IReadOnlyList[LibraryItem] { get { return itemsList } set { itemsList = value } }
    var itemsList IReadOnlyList[LibraryItem] = Array.Empty[LibraryItem]()

    func ListAsync(filter LibraryFilter?, ct CancellationToken) Task[IReadOnlyList[LibraryItem]] {
        return Task.FromResult(Items)
    }

    func GetAsync(asin string, ct CancellationToken) Task[LibraryItem?] {
        return Task.FromResult[LibraryItem?](nil)
    }

    func SyncAsync(profileAlias string, ct CancellationToken) Task[int32] {
        return Task.FromResult(0)
    }

    func EnsureFreshAsync(ct CancellationToken) Task {
        return Task.CompletedTask
    }

    func RefreshAsync(ct CancellationToken) Task {
        return Task.CompletedTask
    }
}

class NullNav : IAppShellNavigator {
    var LastSwitch char = char(0)
    var LastToast string? = nil

    prop ActiveModal IModal? { get { return nil } }

    func SwitchToTab(numberKey char) {
        LastSwitch = numberKey
    }

    func ShowModal(modal IModal) {
    }

    func ShowToast(message string) {
        LastToast = message
    }

    func DismissModal() {
    }

    func SetBroker(broker TuiCallbackBroker?) {
    }

    func TrackLoad(loadTask Task) {
    }
}

@Collection("EnvVarSerial")
class LibraryScreenTests {
    init() {
        Theme.Reset()
    }

    func Key(ch char, k ConsoleKey) ConsoleKeyInfo {
        return ConsoleKeyInfo(ch, k, false, false, false)
    }

    func MakeItem(asin string, title string) LibraryItem {
        return LibraryItem() { Asin = asin, Title = title }
    }

    func CreateScreen(items List[LibraryItem]?) LibraryScreen {
        var lib = FakeLibraryService2()
        if items != nil {
            let cast IReadOnlyList[LibraryItem] = items!!
            lib.Items = cast
        }
        return LibraryScreen(AppShellState(), func() ILibraryService { return lib })
    }

    func CreateScreenWithQueue(items List[LibraryItem], queue IQueueService) LibraryScreen {
        let cast IReadOnlyList[LibraryItem] = items
        var lib = FakeLibraryService2()
        lib.Items = cast
        return LibraryScreen(AppShellState(), func() ILibraryService { return lib }, func() IQueueService { return queue })
    }

    func ActivateScreen(screen LibraryScreen, nav IAppShellNavigator) Task? {
        let ts ITabScreen = screen
        return ts.OnActivatedAsync(nav)
    }

    @Fact
    func Empty_Library_Has_No_Items() {
        var screen = CreateScreen(nil)
        Assert.Empty(screen.Items)
        Theme.Reset()
    }

    @Fact
    func Navigate_With_JK() {
        var items = List[LibraryItem]()
        items.Add(MakeItem("1", "Book A"))
        items.Add(MakeItem("2", "Book B"))
        items.Add(MakeItem("3", "Book C"))
        var screen = CreateScreen(items)
        screen.Reload()
        Assert.Equal(0, screen.Cursor)
        screen.HandleKey(Key('j', ConsoleKey.J))
        Assert.Equal(1, screen.Cursor)
        screen.HandleKey(Key('k', ConsoleKey.K))
        Assert.Equal(0, screen.Cursor)
        Theme.Reset()
    }

    @Fact
    func Space_Toggles_Selection() {
        var items = List[LibraryItem]()
        items.Add(MakeItem("1", "Book A"))
        var screen = CreateScreen(items)
        screen.Reload()
        Assert.Equal(0, screen.SelectedCount)
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        Assert.Equal(1, screen.SelectedCount)
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        Assert.Equal(0, screen.SelectedCount)
        Theme.Reset()
    }

    @Fact
    func A_Selects_All_Then_Deselects() {
        var items = List[LibraryItem]()
        items.Add(MakeItem("1", "A"))
        items.Add(MakeItem("2", "B"))
        var screen = CreateScreen(items)
        screen.Reload()
        screen.HandleKey(Key('a', ConsoleKey.A))
        Assert.Equal(2, screen.SelectedCount)
        screen.HandleKey(Key('a', ConsoleKey.A))
        Assert.Equal(0, screen.SelectedCount)
        Theme.Reset()
    }

    @Fact
    func Search_Filters_Items() {
        var items = List[LibraryItem]()
        items.Add(MakeItem("1", "The Great Gatsby"))
        items.Add(MakeItem("2", "Moby Dick"))
        items.Add(MakeItem("3", "Gatsby Returns"))
        var screen = CreateScreen(items)
        screen.Reload()
        Assert.Equal(3, screen.Items.Count)
        screen.HandleKey(Key('/', ConsoleKey.Oem2))
        screen.HandleKey(ConsoleKeyInfo('g', ConsoleKey.NoName, false, false, false))
        screen.HandleKey(ConsoleKeyInfo('a', ConsoleKey.NoName, false, false, false))
        screen.HandleKey(ConsoleKeyInfo('t', ConsoleKey.NoName, false, false, false))
        screen.HandleKey(ConsoleKeyInfo(char(13), ConsoleKey.Enter, false, false, false))
        Assert.Equal(2, screen.Items.Count)
        Theme.Reset()
    }

    @Fact
    func Esc_Clears_Search() {
        var items = List[LibraryItem]()
        items.Add(MakeItem("1", "Book A"))
        items.Add(MakeItem("2", "Book B"))
        var screen = CreateScreen(items)
        screen.Reload()
        screen.HandleKey(Key('/', ConsoleKey.Oem2))
        screen.HandleKey(ConsoleKeyInfo('A', ConsoleKey.NoName, false, false, false))
        screen.HandleKey(ConsoleKeyInfo(char(13), ConsoleKey.Enter, false, false, false))
        Assert.Single(screen.Items)
        screen.HandleKey(ConsoleKeyInfo(char(27), ConsoleKey.Escape, false, false, false))
        Assert.Equal(2, screen.Items.Count)
        Theme.Reset()
    }

    @Fact
    func Title_Is_Library() {
        var screen = CreateScreen(nil)
        Assert.Equal("Library", screen.Title)
        Assert.Equal('2', screen.NumberKey)
        Theme.Reset()
    }

    @Fact
    func Q_Without_QueueService_Is_NoOp() {
        var items = List[LibraryItem]()
        items.Add(MakeItem("A1", "Alpha"))
        var screen = CreateScreen(items)
        screen.Reload()
        Assert.False(screen.HandleKey(Key('q', ConsoleKey.Q)))
        Theme.Reset()
    }

    @Fact
    func Q_Enqueues_Selected_Items_And_Switches_To_Queue_Tab() {
        var queue = InMemoryQueueService()
        var items = List[LibraryItem]()
        items.Add(MakeItem("A1", "Alpha"))
        items.Add(MakeItem("A2", "Beta"))
        items.Add(MakeItem("A3", "Gamma"))
        var screen = CreateScreenWithQueue(items, queue)
        var nav = NullNav()
        ActivateScreen(screen, nav)
        screen.Reload()

        // Select A1 and A3
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        screen.HandleKey(Key('j', ConsoleKey.J))
        screen.HandleKey(Key('j', ConsoleKey.J))
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        Assert.Equal(2, screen.SelectedCount)

        Assert.True(screen.HandleKey(Key('q', ConsoleKey.Q)))
        Thread.Sleep(200)

        var entries = queue.ListAsync(CancellationToken.None).GetAwaiter().GetResult()
        Assert.Equal(2, entries.Count)
        Assert.Equal(0, screen.SelectedCount)
        Assert.Equal('3', nav.LastSwitch)
        Assert.NotNull(nav.LastToast)
        Theme.Reset()
    }

    @Fact
    func Q_With_No_Selection_Enqueues_Cursor_Item() {
        var queue = InMemoryQueueService()
        var items = List[LibraryItem]()
        items.Add(MakeItem("A1", "Alpha"))
        items.Add(MakeItem("A2", "Beta"))
        var screen = CreateScreenWithQueue(items, queue)
        var nav = NullNav()
        ActivateScreen(screen, nav)
        screen.Reload()

        screen.HandleKey(Key('j', ConsoleKey.J))
        Assert.True(screen.HandleKey(Key('q', ConsoleKey.Q)))
        Thread.Sleep(200)

        var entries = queue.ListAsync(CancellationToken.None).GetAwaiter().GetResult()
        Assert.Single(entries)
        Assert.Equal("A2", entries[0].Asin)
        Assert.Equal('3', nav.LastSwitch)
        Theme.Reset()
    }

    @Fact
    func OnActivated_Reloads_When_LibraryGeneration_Bumped() {
        var state = AppShellState()
        var lib = FakeLibraryService2()
        var items1 = List[LibraryItem]()
        items1.Add(MakeItem("A1", "Alpha"))
        let cast1 IReadOnlyList[LibraryItem] = items1
        lib.Items = cast1

        var screen = LibraryScreen(state, func() ILibraryService { return lib })
        var nav = NullNav()
        var firstLoad = ActivateScreen(screen, nav)
        if firstLoad != nil {
            firstLoad!!.GetAwaiter().GetResult()
        }
        Assert.Single(screen.Items)

        // Add a second item
        var items2 = List[LibraryItem]()
        items2.Add(MakeItem("A1", "Alpha"))
        items2.Add(MakeItem("A2", "Beta"))
        let cast2 IReadOnlyList[LibraryItem] = items2
        lib.Items = cast2

        // Without invalidation, no reload
        var noReload = ActivateScreen(screen, NullNav())
        Assert.Null(noReload)
        Assert.Single(screen.Items)

        // Bump generation → reload
        state.InvalidateLibrary()
        var reload = ActivateScreen(screen, NullNav())
        Assert.NotNull(reload)
        reload!!.GetAwaiter().GetResult()
        Assert.Equal(2, screen.Items.Count)
        Theme.Reset()
    }

    @Fact
    func Q_Skips_Duplicates_And_Reports_In_Toast() {
        var queue = InMemoryQueueService()
        queue.AddAsync(QueueEntry() { Asin = "A1", Title = "Alpha" }, CancellationToken.None).GetAwaiter().GetResult()

        var items = List[LibraryItem]()
        items.Add(MakeItem("A1", "Alpha"))
        items.Add(MakeItem("A2", "Beta"))
        var screen = CreateScreenWithQueue(items, queue)
        var nav = NullNav()
        ActivateScreen(screen, nav)
        screen.Reload()

        screen.HandleKey(Key('a', ConsoleKey.A))
        Assert.True(screen.HandleKey(Key('q', ConsoleKey.Q)))
        Thread.Sleep(200)

        var entries = queue.ListAsync(CancellationToken.None).GetAwaiter().GetResult()
        Assert.Equal(2, entries.Count)
        Assert.NotNull(nav.LastToast)
        Assert.Contains("Enqueued 1", nav.LastToast)
        Assert.Contains("1 already in queue", nav.LastToast)
        Theme.Reset()
    }
}
