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
    prop Cursor int32 -> cursor
    prop SelectedCount int32 -> selected.Count
    prop Items IReadOnlyList[LibraryItem] -> filtered

    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get {
            if searchMode {
                yield KeyValuePair[string, string?]("Enter", "search")
                yield KeyValuePair[string, string?]("Esc", "cancel")
            } else {
                yield KeyValuePair[string, string?]("/", "search")
                yield KeyValuePair[string, string?]("↑↓", "navigate")
                yield KeyValuePair[string, string?]("PgUp/Dn", "page")
                yield KeyValuePair[string, string?]("Space", "select")
                yield KeyValuePair[string, string?]("a", "select all")
                if queueServiceFactory != nil {
                    yield KeyValuePair[string, string?]("q", "enqueue")
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
        let lines = List[IRenderable]()
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        let success = Tokens.StatusSuccess.Value.ToMarkup()
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
        lines.Add(Markup(string.Empty))
        if filtered.Count == 0 {
            lines.Add(
                Markup(
                    "[$tertiary]${(if allItems.Count == 0 { "Library is empty. Sync from the Home tab." } else { "No matches." })}[/]"
                )
            )
            return Padder(Rows(lines)).Padding(2, 1, 2, 1)
        }
        // Visible rows
        let listHeight = Math.Max(1, height - lines.Count - 2)
        lastListHeight = listHeight
        AdjustScroll(listHeight)
        let end = Math.Min(scrollOffset + listHeight, filtered.Count)
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
            lines.Add(
                Markup(
                    "  $pointer $mark  [$style]${Markup.Escape(Truncate(item.Title, width - 30))}[/]  [$tertiary]${Markup.Escape(Truncate(authors, 30))}[/]  [$tertiary]$runtime[/]"
                )
            )
        }
        if filtered.Count > listHeight {
            lines.Add(Markup("[$tertiary]  ↕ ${scrollOffset + 1}–$end of ${filtered.Count}[/]"))
        }
        return Padder(Rows(lines)).Padding(2, 0, 2, 0)
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
            case ConsoleKey.Q when key.Modifiers == 0 {
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
                } catch {
                    // Swallow to keep TUI stable.

                }
            }
        )
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
