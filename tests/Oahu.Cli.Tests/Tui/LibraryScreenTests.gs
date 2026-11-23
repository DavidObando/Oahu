package Oahu.Cli.Tests.Tui

import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Testing
import System
import System.Collections.Generic
import System.Linq
import System.IO
import System.Threading
import System.Threading.Tasks
import Xunit

@Collection("EnvVarSerial")
class LibraryScreenTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() -> Theme.Reset()

    @Fact
    func Render_Empty_Library() {
        let screen = CreateScreen()
        screen.Reload()
        let r = screen.Render(80, 20)
        Assert.NotNull(r)
        Assert.Empty(screen.Items)
    }

    @Fact
    func Navigate_With_JK() {
        let screen = CreateScreen(
            []LibraryItem{MakeItem("1", "Book A"), MakeItem("2", "Book B"), MakeItem("3", "Book C")}
        )
        screen.Reload()
        Assert.Equal(0, screen.Cursor)
        screen.HandleKey(Key('j', ConsoleKey.J))
        Assert.Equal(1, screen.Cursor)
        screen.HandleKey(Key('k', ConsoleKey.K))
        Assert.Equal(0, screen.Cursor)
    }

    @Theory
    @InlineData(ConsoleKey.J)
    @InlineData(ConsoleKey.DownArrow)
    @InlineData(ConsoleKey.PageDown)
    func Navigation_Before_Library_Load_Does_Not_Create_A_Negative_Cursor(key ConsoleKey) {
        let lib = LibraryScreenTests.FakeLibraryService()
        let screen = LibraryScreen(AppShellState(), () -> lib)
        screen.HandleKey(Key('j', key))
        Assert.Equal(0, screen.Cursor)
        lib.Items = []LibraryItem{MakeItem("A1", "Alpha")}
        screen.Reload()
        Assert.NotNull(screen.Render(120, 20))
        Assert.Equal(0, screen.Cursor)
    }

    @Theory
    @InlineData("kitty")
    @InlineData("sixel")
    func Native_Covers_Survive_Layout_Composition_And_Are_Hidden_By_Clipping(protocol string) {
        let path = Path.Combine(Path.GetTempPath(), "oahu-cover-layout-" + Guid.NewGuid().ToString("N") + ".png")
        File.WriteAllBytes(path, Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DA8J+BkYHh////DAAe9gT9Ce00PgAAAABJRU5ErkJggg=="))
        try {
            let screen = CreateScreen([]LibraryItem{LibraryItem{Asin: "A1", Title: "Alpha", CoverImagePath: path}})
            screen.NativeProtocol = if protocol == "kitty" { ImageProtocol.Kitty } else { ImageProtocol.Sixel }
            screen.CellWidth = 10
            screen.CellHeight = 20
            screen.Reload()
            Assert.True(SpinWait.SpinUntil(() -> CoverArt.TryGetNative(path, nil).State != CoverArt.CoverState.Pending, 2000))
            let graphics = TerminalGraphics()
            graphics.Configure("\u001B_Gi=2147483647;OK\u001B\\\u001B[?62;4c\u001B[6;20;10t", protocol, 120, 30)
            let frame = screen.Render(120, 30)
            Assert.NotNull(screen.NativePlacement)
            let console = TestConsole()
            console.Profile.Width = 120
            console.Write(frame)
            let painted = graphics.Paint(console.Output, screen.NativePlacement)
            let nativeSequence = if protocol == "kitty" { "\u001B_Ga=p," } else { "\u001BP0;1;0q" }
            Assert.Contains(nativeSequence, painted)
            Assert.DoesNotContain(char(0xe000).ToString(), painted)
            let overlay = TestConsole()
            overlay.Profile.Width = 120
            overlay.Write(Overlay(frame, Rows(Enumerable.Range(0, 24).Select((_ int32) -> Markup("Dialog"))), 100))
            let covered = graphics.Paint(overlay.Output, screen.NativePlacement)
            Assert.DoesNotContain(nativeSequence, covered)
            Assert.DoesNotContain(char(0xe000).ToString(), covered)
            screen.Render(80, 30)
            Assert.Null(screen.NativePlacement)
            Assert.False(screen.NeedsTimedRefresh)
        } finally {
            File.Delete(path)
        }
    }

    @Fact
    func Space_Toggles_Selection() {
        let screen = CreateScreen([]LibraryItem{MakeItem("1", "Book A")})
        screen.Reload()
        Assert.Equal(0, screen.SelectedCount)
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        Assert.Equal(1, screen.SelectedCount)
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        Assert.Equal(0, screen.SelectedCount)
    }

    @Fact
    func A_Selects_All_Then_Deselects() {
        let screen = CreateScreen([]LibraryItem{MakeItem("1", "A"), MakeItem("2", "B")})
        screen.Reload()
        screen.HandleKey(Key('a', ConsoleKey.A))
        Assert.Equal(2, screen.SelectedCount)
        screen.HandleKey(Key('a', ConsoleKey.A))
        Assert.Equal(0, screen.SelectedCount)
    }

    @Fact
    func Search_Filters_Items() {
        let screen = CreateScreen(
            []LibraryItem{
                MakeItem("1", "The Great Gatsby"),
                MakeItem("2", "Moby Dick"),
                MakeItem("3", "Gatsby Returns")
            }

        )
        screen.Reload()
        Assert.Equal(3, screen.Items.Count)
        // Enter search mode
        screen.HandleKey(Key('/', ConsoleKey.Oem2))
        screen.HandleKey(Key('g'))
        screen.HandleKey(Key('a'))
        screen.HandleKey(Key('t'))
        screen.HandleKey(Key('\r', ConsoleKey.Enter))
        Assert.Equal(2, screen.Items.Count) // "Gatsby" matches 2

    }

    @Fact
    func Select_All_Toggles_Visible_Membership_And_Preserves_Hidden_Selections() {
        let screen = CreateScreen([]LibraryItem{
            MakeItem("1", "Alpha"), MakeItem("2", "Alpine"),
            MakeItem("3", "Beta"), MakeItem("4", "Betty")
        })
        screen.Reload()
        screen.HandleKey(Key('/', ConsoleKey.Oem2))
        screen.HandleKey(Key('A'))
        screen.HandleKey(Key('l'))
        screen.HandleKey(Key('\r', ConsoleKey.Enter))
        screen.HandleKey(Key('a', ConsoleKey.A))
        Assert.Equal(2, screen.SelectedCount)
        screen.HandleKey(Key(char(27), ConsoleKey.Escape))
        screen.HandleKey(Key('/', ConsoleKey.Oem2))
        screen.HandleKey(Key('B'))
        screen.HandleKey(Key('e'))
        screen.HandleKey(Key('\r', ConsoleKey.Enter))
        Assert.Equal(2, screen.Items.Count)
        screen.HandleKey(Key('a', ConsoleKey.A))
        Assert.Equal(4, screen.SelectedCount)
        screen.HandleKey(Key('a', ConsoleKey.A))
        Assert.Equal(2, screen.SelectedCount)
    }

    @Fact
    func Esc_Clears_Search() {
        let screen = CreateScreen([]LibraryItem{MakeItem("1", "Book A"), MakeItem("2", "Book B")})
        screen.Reload()
        // Search for "A"
        screen.HandleKey(Key('/', ConsoleKey.Oem2))
        screen.HandleKey(Key('A'))
        screen.HandleKey(Key('\r', ConsoleKey.Enter))
        Assert.Single(screen.Items)
        // Esc clears filter
        screen.HandleKey(Key(char(27), ConsoleKey.Escape))
        Assert.Equal(2, screen.Items.Count)
    }

    @Fact
    func Title_Is_Library() {
        let screen = CreateScreen()
        Assert.Equal("Library", screen.Title)
        Assert.Equal('2', screen.NumberKey)
    }

    @Fact
    async func E_Enqueues_Selected_Items_And_Switches_To_Queue_Tab() {
        let queue = InMemoryQueueService()
        let screen = CreateScreen(
            []LibraryItem{MakeItem("A1", "Alpha", "Auth1"), MakeItem("A2", "Beta", "Auth2"), MakeItem("A3", "Gamma")},
            queue
        )
        let nav = NullNavigator()
        let _ = screen.OnActivatedAsync(nav)
        screen.Reload()
        // Select A1 and A3.
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        screen.HandleKey(Key('j', ConsoleKey.J))
        screen.HandleKey(Key('j', ConsoleKey.J))
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        Assert.Equal(2, screen.SelectedCount)
        Assert.True(screen.HandleKey(Key('e', ConsoleKey.E)))
        await WaitForEnqueue(screen)
        let entries = await queue.ListAsync()
        Assert.Equal([]string{"A1", "A3"}, entries.Select((e QueueEntry) -> e.Asin).ToArray())
        Assert.Equal(0, screen.SelectedCount)
        Assert.Equal('3', nav.LastSwitch)
        Assert.NotNull(nav.LastToast)
        Assert.Contains("Enqueued 2", nav.LastToast)
    }

    @Fact
    async func E_With_No_Selection_Enqueues_Cursor_Item() {
        let queue = InMemoryQueueService()
        let screen = CreateScreen([]LibraryItem{MakeItem("A1", "Alpha"), MakeItem("A2", "Beta")}, queue)
        let nav = NullNavigator()
        let _ = screen.OnActivatedAsync(nav)
        screen.Reload()
        // Move to second item and press e with no selection.
        screen.HandleKey(Key('j', ConsoleKey.J))
        Assert.True(screen.HandleKey(Key('e', ConsoleKey.E)))
        await WaitForEnqueue(screen)
        let entries = await queue.ListAsync()
        Assert.Single(entries)
        Assert.Equal("A2", entries[0].Asin)
        Assert.Equal('3', nav.LastSwitch)
    }

    @Fact
    async func E_Skips_Duplicates_And_Reports_In_Toast() {
        let queue = InMemoryQueueService()
        await queue.AddAsync(QueueEntry{Asin: "A1", Title: "Alpha"})
        let screen = CreateScreen([]LibraryItem{MakeItem("A1", "Alpha"), MakeItem("A2", "Beta")}, queue)
        let nav = NullNavigator()
        let _ = screen.OnActivatedAsync(nav)
        screen.Reload()
        screen.HandleKey(Key('a', ConsoleKey.A)) // select all
        Assert.True(screen.HandleKey(Key('e', ConsoleKey.E)))
        await WaitForEnqueue(screen)
        let entries = await queue.ListAsync()
        Assert.Equal([]string{"A1", "A2"}, entries.Select((e QueueEntry) -> e.Asin).ToArray())
        Assert.NotNull(nav.LastToast)
        Assert.Contains("Enqueued 1", nav.LastToast)
        Assert.Contains("1 already in queue", nav.LastToast)
    }

    @Fact
    func E_Without_QueueService_Is_NoOp() {
        // No queue service wired in (legacy 2-arg ctor).
        let screen = CreateScreen([]LibraryItem{MakeItem("A1", "Alpha")})
        screen.Reload()
        // Should NOT consume the key ('e' has no global fallback; the press
        // is simply inert when no queue service is wired).
        Assert.False(screen.HandleKey(Key('e', ConsoleKey.E)))
    }

    @Fact
    async func OnActivated_Reloads_When_LibraryGeneration_Bumped() {
        // Wire the screen and library service against a shared AppShellState so
        // that bumping LibraryGeneration on Home triggers a fresh ListAsync the
        // next time the user activates the Library tab.
        let state = AppShellState()
        let lib = LibraryScreenTests.FakeLibraryService{Items: []LibraryItem{MakeItem("A1", "Alpha")}}
        let screen = LibraryScreen(
            state,
            func () ILibraryService {
                return lib
            }
        )
        let firstLoad Task? = screen.OnActivatedAsync(NullNavigator())
        if firstLoad != nil {
            await firstLoad
        }
        Assert.Single(screen.Items)
        // Simulate a Home-screen 'r' refresh that pulled a newly-purchased title.
        lib.Items = []LibraryItem{MakeItem("A1", "Alpha"), MakeItem("A2", "Beta")}
        // Without invalidation, OnActivatedAsync should be a no-op (loaded gate).
        Assert.Null(screen.OnActivatedAsync(NullNavigator()))
        Assert.Single(screen.Items)
        // Bump the generation: next activation must reload.
        state.InvalidateLibrary()
        let reload = screen.OnActivatedAsync(NullNavigator())
        Assert.NotNull(reload)
        await reload!!
        Assert.Equal(2, screen.Items.Count)
    }

    private class FakeLibraryService : ILibraryService {
        private var _items IReadOnlyList[LibraryItem] = Array.Empty[LibraryItem]()

        prop Items IReadOnlyList[LibraryItem] {
            get {
                return _items
            }
            set {
                _items = value
            }
        }

        func ListAsync(filter LibraryFilter? = nil, ct CancellationToken = default(CancellationToken)) Task[
            IReadOnlyList[LibraryItem]
        ] -> Task.FromResult(Items)

        func GetAsync(asin string, ct CancellationToken = default(CancellationToken)) Task[
            LibraryItem?
        ] -> Task.FromResult[LibraryItem?](nil)

        func SyncAsync(profileAlias string, ct CancellationToken = default(CancellationToken)) Task[
            int32
        ] -> Task.FromResult(0)

        func EnsureFreshAsync(ct CancellationToken = default(CancellationToken)) Task -> Task.CompletedTask

        func RefreshAsync(ct CancellationToken = default(CancellationToken)) Task -> Task.CompletedTask
    }

    shared {
        private func Key(
            ch char,
            k ConsoleKey = ConsoleKey.NoName,
            mod ConsoleModifiers = ConsoleModifiers.None
        ) ConsoleKeyInfo -> ConsoleKeyInfo(
            ch,
            k,
            shift: (mod & ConsoleModifiers.Shift) != 0,
            alt: (mod & ConsoleModifiers.Alt) != 0,
            control: (mod & ConsoleModifiers.Control) != 0
        )

        private func CreateScreen(items IReadOnlyList[LibraryItem]? = nil, queue IQueueService? = nil) LibraryScreen {
            let lib = LibraryScreenTests.FakeLibraryService{Items: items ?? Array.Empty[LibraryItem]()}
            return LibraryScreen(
                AppShellState(),
                func () ILibraryService {
                    return lib
                },
                if queue == nil {
                    default((() -> IQueueService)?)
                } else {
                    () -> queue
                }
            )
        }

        private func MakeItem(asin string, title string, authors ...string) LibraryItem -> LibraryItem{
            Asin: asin,
            Title: title,
            Authors: authors
        }

        private async func WaitForEnqueue(screen LibraryScreen) {
            let task Task? = screen.PendingEnqueue
            if task != nil {
                await task
            }
        }
    }
}
