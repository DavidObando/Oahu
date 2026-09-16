package Oahu.Cli.Tui.Screens

import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Linq
import System.Threading.Tasks

/// Library screen (tab 2). Searchable, multi-select table with detail
/// panel. Per design TUI-exploration §3–4.
class LibraryScreen : ITabScreen {
    private let state AppShellState
    private let libraryServiceFactory() -> ILibraryService
    private let queueServiceFactory(() -> IQueueService)?
    private let selected HashSet[string] = HashSet[string](StringComparer.Ordinal)
    private let searchInput TextInput = TextInput{Label: "/", MaxLength: 128}
    private var allItems IReadOnlyList[LibraryItem] = Array.Empty[LibraryItem]()
    private var filtered IReadOnlyList[LibraryItem] = Array.Empty[LibraryItem]()
    private var cursor int32
    private var scrollOffset int32
    private var lastListHeight int32 = 20
    private var loaded bool
    private var lastSeenLibraryGeneration int32
    private var searchMode bool
    private var navigator IAppShellNavigator?
    private var enqueueTask Task?
    private var coverPending bool
    private var lastListTop int32 = 2
    private var lastListWidth int32 = 80

    convenience init(state AppShellState, libraryServiceFactory() -> ILibraryService) {
        init(state, libraryServiceFactory, nil)
    }

    init(state AppShellState, libraryServiceFactory() -> ILibraryService, queueServiceFactory(() -> IQueueService)?) {
        this.state = state ?? throw ArgumentNullException("state")
        this.libraryServiceFactory = libraryServiceFactory ?? throw ArgumentNullException("libraryServiceFactory")
        this.queueServiceFactory = queueServiceFactory
    }

    prop Title string -> "Library"
    prop NumberKey char -> '2'
    prop NeedsTimedRefresh bool -> coverPending
    prop Cursor int32 -> cursor
    prop SelectedCount int32 -> selected.Count
    prop Items IReadOnlyList[LibraryItem] -> filtered

    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get {
            if searchMode {
                yield KeyValuePair[string, string?]("enter", "search")
                yield KeyValuePair[string, string?]("esc", "cancel")
            } else {
                yield KeyValuePair[string, string?]("/", "search")
                yield KeyValuePair[string, string?]("↑↓", "navigate")
                yield KeyValuePair[string, string?]("space", "select")
                yield KeyValuePair[string, string?]("a", "select all")
                if queueServiceFactory != nil {
                    yield KeyValuePair[string, string?]("e", "enqueue")
                }
            }
        }
    }

    func OnActivatedAsync(navigator IAppShellNavigator) Task? {
        this.navigator = navigator
        if !loaded {
            loaded = true
            lastSeenLibraryGeneration = state.LibraryGeneration
            return LoadAsync()
        }
        // The user pressed 'r' on Home (or another screen invalidated the
        // library cache) while we were on a different tab — pull a fresh
        // snapshot so the new title shows up without restarting.
        if state.LibraryGeneration != lastSeenLibraryGeneration {
            lastSeenLibraryGeneration = state.LibraryGeneration
            return LoadAsync()
        }
        return nil
    }

    func Render(width int32, height int32) IRenderable {
        // Master/detail split on wide terminals: list on the left, a detail
        // pane (cover art + metadata) for the cursor item on the right.
        let detailWidth = if width >= 96 {
            Math.Clamp(width * 2 / 5, 34, 44)
        } else {
            0
        }
        let listWidth = if detailWidth > 0 {
            width - detailWidth - 1
        } else {
            width
        }
        lastListWidth = listWidth
        let list = RenderList(listWidth, height)
        if detailWidth == 0 {
            return list
        }
        let paneColor = Tokens.BackgroundSecondary.Value
        let paneFill = if Tokens.HasBackdrop {
            Style(background: paneColor)
        } else {
            Style.Plain
        }
        let pane = FixedHeight(
            Widgets.Backdrop(RenderDetail(detailWidth - 4, height), paneColor, padLeft: 2, padRight: 2, padTop: 1),
            height,
            paneFill
        )
        return Widgets.SideBySide(list, listWidth, 1, pane, detailWidth, nil)
    }

    private func RenderList(width int32, height int32) IRenderable {
        let lines = List[IRenderable]()
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        let success = Tokens.StatusSuccess.Value.ToMarkup()
        lines.Add(Markup(" "))
        // Search bar
        if searchMode {
            lines.Add(searchInput.Render())
        } else if !string.IsNullOrEmpty(searchInput.Text) {
            lines.Add(Markup("[$tertiary]Filter: ${Markup.Escape(searchInput.Text)}  (/ to change, Esc to clear)[/]"))
        }
        // Summary line
        let selStr = if selected.Count > 0 {
            "  [$brand]${selected.Count} selected[/]"
        } else {
            string.Empty
        }
        lines.Add(Markup("[$secondary]${filtered.Count} of ${allItems.Count} titles$selStr[/]"))
        lines.Add(Markup(" "))
        if filtered.Count == 0 {
            lines.Add(
                Markup(
                    "[$tertiary]${(if allItems.Count == 0 { "Library is empty. Sync from the Home tab." } else { "No matches." })}[/]"
                )
            )
            return Padder(Rows(lines)).Padding(2, 0, 2, 0)
        }
        // Visible rows
        let listHeight = Math.Max(1, height - lines.Count - 2)
        lastListHeight = listHeight
        lastListTop = lines.Count
        AdjustScroll(listHeight)
        let end = Math.Min(scrollOffset + listHeight, filtered.Count)
        let cursorBg = Tokens.InputBackground.Value
        for var i = scrollOffset;
        i < end;
        i++ {
            let item = filtered[i]
            let isCursor = i == cursor
            let isSel = selected.Contains(item.Asin)
            let mark = if isSel {
                "[$success]✓[/]"
            } else {
                " "
            }
            let pointer = if isCursor {
                "[$brand]❯[/]"
            } else {
                " "
            }
            let style = if isCursor {
                "bold $primary"
            } else {
                secondary
            }
            let authors = if item.Authors.Length > 0 {
                string.Join(", ", item.Authors)
            } else {
                string.Empty
            }
            let runtime = if item.Runtime is {} r {
                FormatRuntime(r)
            } else {
                string.Empty
            }
            // Fixed columns: title | authors | runtime (right-aligned), so the
            // list reads as a table without drawing one.
            let runtimeWidth = 7
            let authorWidth = Math.Clamp((width - 14 - runtimeWidth) / 3, 12, 30)
            let titleWidth = Math.Max(12, width - 10 - authorWidth - runtimeWidth)
            let titleCell = Truncate(item.Title, titleWidth).PadRight(titleWidth)
            let authorCell = Truncate(authors, authorWidth).PadRight(authorWidth)
            let runtimeCell = runtime.PadLeft(runtimeWidth)
            let rowText =
                "$pointer $mark [$style]${Markup.Escape(titleCell)}[/] [$tertiary]${Markup.Escape(authorCell)}[/][$tertiary]${Markup.Escape(runtimeCell)}[/]"
            if isCursor && Tokens.HasBackdrop {
                // Full-width highlight for the cursor row.
                lines.Add(Widgets.Backdrop(Markup(rowText), cursorBg, padLeft: 2, padRight: 1))
            } else {
                lines.Add(Padder(Markup(rowText)).Padding(2, 0, 0, 0))
            }
        }
        if filtered.Count > listHeight {
            lines.Add(Markup("  [$tertiary]↕ ${scrollOffset + 1}–$end of ${filtered.Count}[/]"))
        }
        return Rows(lines)
    }

    /// The right-hand detail pane for the cursor item: cover art (half-block
    /// truecolor) plus metadata. Cover decoding runs in the background; while
    /// pending this screen reports (cref:NeedsTimedRefresh) so the shell keeps
    /// re-rendering until the art pops in.
    private func RenderDetail(width int32, height int32) IRenderable {
        coverPending = false
        let lines = List[IRenderable]()
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        if cursor < 0 || cursor >= filtered.Count {
            lines.Add(Markup("[$tertiary]No selection.[/]"))
            return Rows(lines)
        }
        let item = filtered[cursor]
        // Cover art (skipped in Mono/ASCII where half-blocks would degrade).
        if Tokens.HasBackdrop && !Icons.Icons.ForceAscii {
            let coverWidth = Math.Min(width, 26)
            let cover = Widgets.CoverArt.TryGet(item.CoverImagePath, item.CoverImageUrl, coverWidth)
            if cover.State == Widgets.CoverArt.CoverState.Ready && cover.Lines != nil {
                for line in cover.Lines!! {
                    lines.Add(Markup(line))
                }
                lines.Add(Markup(" "))
            } else if cover.State == Widgets.CoverArt.CoverState.Pending {
                coverPending = true
                let ph = String('░', Math.Max(1, coverWidth))
                for var r = 0;
                r < Math.Max(1, coverWidth / 2);
                r++ {
                    lines.Add(Markup("[$tertiary]$ph[/]"))
                }
                lines.Add(Markup(" "))
            }
        }
        lines.Add(Markup("[$primary bold]${Markup.Escape(item.Title)}[/]"))
        if item.Subtitle is {} sub {
            lines.Add(Markup("[$secondary]${Markup.Escape(sub)}[/]"))
        }
        lines.Add(Markup(" "))
        if item.Authors.Length > 0 {
            lines.Add(Markup("[$secondary]by ${Markup.Escape(string.Join(", ", item.Authors))}[/]"))
        }
        if item.Narrators.Length > 0 {
            lines.Add(Markup("[$tertiary]read by ${Markup.Escape(string.Join(", ", item.Narrators))}[/]"))
        }
        if item.Series is {} series {
            let position = if item.SeriesPosition is {} pos {
                " · #${pos:0.###}"
            } else {
                string.Empty
            }
            lines.Add(Markup("[$tertiary]${Markup.Escape(series)}$position[/]"))
        }
        lines.Add(Markup(" "))
        let facts = List[string]()
        if item.Runtime is {} runtime {
            facts.Add(FormatRuntime(runtime))
        }
        if item.PurchaseDate is {} purchased {
            facts.Add("added ${purchased.ToLocalTime().ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)}")
        }
        if item.HasMultiplePartFiles {
            facts.Add("multi-part")
        }
        if facts.Count > 0 {
            lines.Add(Markup("[$tertiary]${Markup.Escape(string.Join("  ·  ", facts))}[/]"))
        }
        if selected.Contains(item.Asin) {
            lines.Add(Markup(" "))
            lines.Add(Markup("[${Tokens.StatusSuccess.Value.ToMarkup()}]✓ selected[/]"))
        }
        lines.Add(Markup(" "))
        lines.Add(Markup("[$brand]e[/] [$tertiary]enqueue for download[/]"))
        return Rows(lines)
    }

    func HandleScroll(delta int32) bool {
        if filtered.Count == 0 {
            return true
        }
        cursor = Math.Clamp(cursor + delta, 0, filtered.Count - 1)
        return true
    }

    func HandleClick(x int32, y int32) bool {
        // Clicks in the detail pane are inert; only the list is interactive.
        if x >= lastListWidth {
            return false
        }
        let idx = scrollOffset + (y - lastListTop)
        if y < lastListTop || idx < 0 || idx >= filtered.Count || idx >= scrollOffset + lastListHeight {
            return false
        }
        if idx == cursor {
            // Second click on the focused row toggles selection, like Space.
            let asin = filtered[idx].Asin
            if !selected.Remove(asin) {
                selected.Add(asin)
            }
        } else {
            cursor = idx
        }
        return true
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        if searchMode {
            switch key.Key {
                case ConsoleKey.Enter {
                    searchMode = false
                    ApplyFilter()
                    return true
                }
                case ConsoleKey.Escape {
                    searchMode = false
                    this.searchInput.Text = string.Empty
                    ApplyFilter()
                    return true
                }
                default {
                    return searchInput.HandleKey(key)
                }
            }
        }
        switch key.Key {
            case ConsoleKey.UpArrow, ConsoleKey.K {
                cursor = Math.Max(0, cursor - 1)
                return true
            }
            case ConsoleKey.DownArrow, ConsoleKey.J {
                cursor = Math.Min(filtered.Count - 1, Math.Max(0, cursor + 1))
                return true
            }
            case ConsoleKey.PageUp {
                cursor = Math.Max(0, cursor - lastListHeight)
                return true
            }
            case ConsoleKey.PageDown {
                cursor = Math.Min(filtered.Count - 1, Math.Max(0, cursor + lastListHeight))
                return true
            }
            case ConsoleKey.Home {
                cursor = 0
                return true
            }
            case ConsoleKey.End {
                cursor = Math.Max(0, filtered.Count - 1)
                return true
            }
            case ConsoleKey.Spacebar {
                if cursor >= 0 && cursor < filtered.Count {
                    let asin = filtered[cursor].Asin
                    if !selected.Remove(asin) {
                        selected.Add(asin)
                    }
                }
                return true
            }
            case ConsoleKey.A when key.Modifiers == 0 {
                if selected.Count == filtered.Count {
                    selected.Clear()
                } else {
                    for item in filtered {
                        selected.Add(item.Asin)
                    }
                }
                return true
            }
            case ConsoleKey.Escape {
                if !string.IsNullOrEmpty(searchInput.Text) {
                    this.searchInput.Text = string.Empty
                    ApplyFilter()
                    return true
                }
                if selected.Count > 0 {
                    selected.Clear()
                    return true
                }
            }
            case ConsoleKey.E when key.Modifiers == 0 {
                return EnqueueSelection()
            }
            default {
                let _ = 0
            }
        }
        if key.KeyChar == '/' {
            searchMode = true
            return true
        }
        return false
    }

    /// Load library items synchronously (used by tests and explicit refresh).
    func Reload() {
        try {
            let lib = libraryServiceFactory()
            allItems = lib.ListAsync().GetAwaiter().GetResult()
            loaded = true
            ApplyFilter()
            PrefetchCovers()
        } catch {
            loaded = true
            // Swallow to keep TUI stable.

        }
    }

    /// Load library items asynchronously (returned to shell for tracking).
    private func LoadAsync() Task {
        return Task.Run(
            () -> {
                try {
                    let lib = libraryServiceFactory()
                    let items = lib.ListAsync().GetAwaiter().GetResult()
                    allItems = items
                    ApplyFilter()
                    PrefetchCovers()
                } catch {
                    // Swallow to keep TUI stable.

                }
            }
        )
    }

    /// Kick the shared cover cache-fill for any titles whose art is missing on
    /// disk (CLI-only installs never run the GUI's cover download). No-op when
    /// the theme can't show covers anyway.
    private func PrefetchCovers() {
        if !Tokens.HasBackdrop || Icons.Icons.ForceAscii {
            return
        }
        let covers = allItems
            .Select((i LibraryItem) -> (Path: i.CoverImagePath, Url: i.CoverImageUrl))
            .ToArray()
        Widgets.CoverArt.Prefetch(covers)
    }

    /// Background task spawned by `q`; exposed for tests.
    internal prop PendingEnqueue Task? -> enqueueTask

    /// Enqueue the currently-selected items (or the cursor item when no
    /// multi-selection is active) into the persistent queue and switch to
    /// the Queue tab. No-op when no queue service was wired in.
    private func EnqueueSelection() bool {
        if queueServiceFactory == nil {
            return false
        }
        var targets IReadOnlyList[LibraryItem]
        if selected.Count > 0 {
            let byAsin = filtered
                .Concat(allItems)
                .GroupBy((i LibraryItem) -> i.Asin, StringComparer.Ordinal)
                .ToDictionary(
                (g IGrouping[string, LibraryItem]) -> g.Key,
                (g IGrouping[string, LibraryItem]) -> g.First(),
                StringComparer.Ordinal
            )
            targets = selected.Where(byAsin.ContainsKey).Select((a string) -> byAsin[a]).ToArray()
        } else if cursor >= 0 && cursor < filtered.Count {
            targets = []LibraryItem{filtered[cursor]}
        } else {
            return true
        }
        if targets.Count == 0 {
            return true
        }
        let snapshot = targets
        let nav = navigator
        enqueueTask = Task.Run(
            async () -> {
                var added = 0
                var skipped = 0
                try {
                    let queue = queueServiceFactory!!()
                    for item in snapshot {
                        let entry = QueueEntry{Asin: item.Asin, Title: item.Title}
                        if await queue.AddAsync(entry).ConfigureAwait(false) {
                            added++
                        } else {
                            skipped++
                        }
                    }
                } catch (ex Exception) {
                    nav?.ShowToast("Enqueue failed: ${ex.Message}")
                    return
                }
                let msg = switch (added, skipped) {
                    case {Item1: 0, Item2: 0}: "Nothing to enqueue."
                    case {Item2: 0}: "Enqueued $added ${Pluralize(added, "title", "titles")}."
                    case {Item1: 0}: "Already in queue ($skipped skipped)."
                    default: "Enqueued $added · $skipped already in queue."
                }
                nav?.ShowToast(msg)
                if added > 0 {
                    nav?.SwitchToTab('3')
                }
            }
        )
        selected.Clear()
        return true
    }

    private func ApplyFilter() {
        let search = searchInput.Text.Trim()
        if string.IsNullOrEmpty(search) {
            filtered = allItems
        } else {
            filtered = allItems.Where(
                (i LibraryItem) -> i.Title.Contains(search, StringComparison.OrdinalIgnoreCase) || i.Authors.Any(
                    (a string) -> a.Contains(search, StringComparison.OrdinalIgnoreCase)
                ) ||
                    (i.Series?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false)
            )
                .ToArray()
        }
        cursor = Math.Min(cursor, Math.Max(0, filtered.Count - 1))
    }

    private func AdjustScroll(visibleHeight int32) {
        if cursor < scrollOffset {
            scrollOffset = cursor
        } else if cursor >= scrollOffset + visibleHeight {
            scrollOffset = cursor - visibleHeight + 1
        }
    }

    shared {
        private func FormatRuntime(ts TimeSpan) string {
            if ts.TotalHours >= float64(1.0) {
                return "${int32(ts.TotalHours)}h${ts.Minutes:D2}m"
            }
            return "${ts.Minutes}m"
        }

        private func Truncate(s string, max int32) string -> if s.Length <= max {
            s
        } else {
            s[.. (max - 1)] + "…"
        }

        private func Pluralize(n int32, singular string, plural string) string -> if n == 1 {
            singular
        } else {
            plural
        }
    }
}
