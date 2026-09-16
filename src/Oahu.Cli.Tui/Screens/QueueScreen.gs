package Oahu.Cli.Tui.Screens

import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks

/// Queue screen (tab 3). Shows the persistent `queue.json` entries with
/// reorder / remove / submit actions. Per design TUI-exploration §5.
class QueueScreen : ITabScreen {
    private let queueServiceFactory() -> IQueueService
    private let jobServiceFactory() -> IJobService
    private var entries IReadOnlyList[QueueEntry] = Array.Empty[QueueEntry]()
    private var cursor int32
    private var scrollOffset int32
    private var lastListHeight int32 = 20
    private var busy bool
    private var statusMessage string?
    private var spinnerTick int32
    private var navigator IAppShellNavigator?

    init(queueServiceFactory() -> IQueueService, jobServiceFactory() -> IJobService) {
        this.queueServiceFactory = queueServiceFactory ?? throw ArgumentNullException("queueServiceFactory")
        this.jobServiceFactory = jobServiceFactory ?? throw ArgumentNullException("jobServiceFactory")
    }

    prop Title string -> "Queue"
    prop NumberKey char -> '3'
    prop NeedsTimedRefresh bool -> busy
    prop Entries IReadOnlyList[QueueEntry] -> entries
    prop Cursor int32 -> cursor

    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get {
            yield KeyValuePair[string, string?]("↑↓", "navigate")
            yield KeyValuePair[string, string?]("shift+↑↓", "move")
            yield KeyValuePair[string, string?]("enter", "run")
            yield KeyValuePair[string, string?]("r", "run all")
            yield KeyValuePair[string, string?]("x", "remove")
            yield KeyValuePair[string, string?]("c", "clear")
        }
    }

    func OnActivatedAsync(navigator IAppShellNavigator) Task? {
        this.navigator = navigator
        return LoadAsync()
    }

    func OnDeactivated() {
        // Nothing to tear down — load tasks finish on their own.

    }

    func Render(width int32, height int32) IRenderable {
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        let lines = List[IRenderable]{
            Markup("[$primary bold]Queue[/]  [$secondary](${entries.Count} pending)[/]"),
            Markup(string.Empty)
        }
        if busy {
            spinnerTick++
            let spinChars = []char{'⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'}
            let ch = spinChars[spinnerTick % spinChars.Length]
            lines.Add(Markup("[$brand]$ch[/] [$secondary]Working…[/]"))
            lines.Add(Markup(string.Empty))
        } else if !string.IsNullOrEmpty(statusMessage) {
            lines.Add(Markup("[$tertiary]${Markup.Escape(statusMessage!!)}[/]"))
            lines.Add(Markup(string.Empty))
        }
        if entries.Count == 0 {
            lines.Add(Markup("[$tertiary]Queue is empty. Add titles from the Library tab.[/]"))
            return Padder(Rows(lines)).Padding(2, 1, 2, 1)
        }
        let listHeight = Math.Max(1, height - lines.Count - 2)
        lastListHeight = listHeight
        AdjustScroll(listHeight)
        let end = Math.Min(scrollOffset + listHeight, entries.Count)
        for var i = scrollOffset;
        i < end;
        i++ {
            let entry = entries[i]
            let isCursor = i == cursor
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
            let quality = entry.Quality.ToString().ToLowerInvariant()
            let profile = if entry.ProfileAlias == nil {
                string.Empty
            } else {
                "  [$tertiary]@${Markup.Escape(entry.ProfileAlias!!)}[/]"
            }
            lines.Add(
                Markup(
                    "  $pointer  [$style]${(i + 1),3}. ${Markup.Escape(Truncate(entry.Title, width - 28))}[/]  [$tertiary]$quality[/]$profile"
                )
            )
        }
        if entries.Count > listHeight {
            lines.Add(Markup("[$tertiary]  ↕ ${scrollOffset + 1}–$end of ${entries.Count}[/]"))
        }
        return Padder(Rows(lines)).Padding(2, 0, 2, 0)
    }

    func HandleScroll(delta int32) bool {
        if entries.Count == 0 {
            return true
        }
        cursor = Math.Clamp(cursor + delta, 0, entries.Count - 1)
        return true
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        if busy {
            // Ignore input while a mutation is in flight to keep the model consistent.
            return false
        }
        switch key.Key {
            case ConsoleKey.UpArrow when(key.Modifiers & ConsoleModifiers.Shift) != 0 {
                MoveSelected(-1)
                return true
            }
            case ConsoleKey.DownArrow when(key.Modifiers & ConsoleModifiers.Shift) != 0 {
                MoveSelected(+ 1)
                return true
            }
            case ConsoleKey.UpArrow, ConsoleKey.K {
                cursor = Math.Max(0, cursor - 1)
                return true
            }
            case ConsoleKey.DownArrow, ConsoleKey.J {
                cursor = Math.Min(entries.Count - 1, Math.Max(0, cursor + 1))
                return true
            }
            case ConsoleKey.PageUp {
                cursor = Math.Max(0, cursor - lastListHeight)
                return true
            }
            case ConsoleKey.PageDown {
                cursor = Math.Min(entries.Count - 1, Math.Max(0, cursor + lastListHeight))
                return true
            }
            case ConsoleKey.Home {
                cursor = 0
                return true
            }
            case ConsoleKey.End {
                cursor = Math.Max(0, entries.Count - 1)
                return true
            }
            case ConsoleKey.X, ConsoleKey.Delete {
                RemoveSelected()
                return true
            }
            case ConsoleKey.Enter {
                RunSelected()
                return true
            }
            case ConsoleKey.R when(key.Modifiers & ConsoleModifiers.Control) != 0 {
                Reload()
                return true
            }
            case ConsoleKey.R {
                RunAll()
                return true
            }
            case ConsoleKey.C when key.Modifiers == 0 {
                ClearAll()
                return true
            }
            case ConsoleKey.F5 {
                Reload()
                return true
            }
            default {
                let _ = 0
            }
        }
        return false
    }

    private func LoadAsync() Task {
        return Task.Run(
            async () -> {
                try {
                    let svc = queueServiceFactory()
                    entries = await svc.ListAsync().ConfigureAwait(false)
                    cursor = Math.Min(cursor, Math.Max(0, entries.Count - 1))
                } catch (ex Exception) {
                    statusMessage = "Failed to load queue: ${ex.Message}"
                    entries = Array.Empty[QueueEntry]()
                }
            }
        )
    }

    private func Reload() {
        navigator?.TrackLoad(LoadAsync())
    }

    private func MoveSelected(delta int32) {
        if cursor < 0 || cursor >= entries.Count {
            return
        }
        let asin = entries[cursor].Asin
        let newIndex = cursor + delta
        if newIndex < 0 || newIndex >= entries.Count {
            return
        }
        StartMutation(
            async () -> {
                let svc = queueServiceFactory()
                await svc.MoveAsync(asin, delta).ConfigureAwait(false)
                entries = await svc.ListAsync().ConfigureAwait(false)
                cursor = Math.Max(0, Math.Min(newIndex, entries.Count - 1))
            },
            msg: nil
        )
    }

    private func RemoveSelected() {
        if cursor < 0 || cursor >= entries.Count {
            return
        }
        let asin = entries[cursor].Asin
        let prevCursor = cursor
        StartMutation(
            async () -> {
                let svc = queueServiceFactory()
                await svc.RemoveAsync(asin).ConfigureAwait(false)
                entries = await svc.ListAsync().ConfigureAwait(false)
                cursor = Math.Max(0, Math.Min(prevCursor, entries.Count - 1))
            },
            "Removed."
        )
    }

    private func RunSelected() {
        if cursor < 0 || cursor >= entries.Count {
            return
        }
        let entry = entries[cursor]
        StartMutation(
            async () -> {
                await SubmitEntryAsync(entry).ConfigureAwait(false)
                let svc = queueServiceFactory()
                await svc.RemoveAsync(entry.Asin).ConfigureAwait(false)
                entries = await svc.ListAsync().ConfigureAwait(false)
                cursor = Math.Max(0, Math.Min(cursor, entries.Count - 1))
            },
            "Submitted.",
            switchToJobs: true
        )
    }

    private func RunAll() {
        if entries.Count == 0 {
            return
        }
        let snapshot = entries.ToArray()
        StartMutation(
            async () -> {
                let svc = queueServiceFactory()
                var submitted = 0
                for entry in snapshot {
                    try {
                        await SubmitEntryAsync(entry).ConfigureAwait(false)
                        await svc.RemoveAsync(entry.Asin).ConfigureAwait(false)
                        submitted++
                    } catch {
                        // Stop on first failure, leaving the unsubmitted entries
                        // (and the failing one) in the queue for inspection.
                        break
                    }
                }
                entries = await svc.ListAsync().ConfigureAwait(false)
                cursor = Math.Max(0, Math.Min(cursor, entries.Count - 1))
                statusMessage = "Submitted $submitted of ${snapshot.Length}."
            },
            msg: nil,
            switchToJobs: true
        )
    }

    private func ClearAll() {
        if entries.Count == 0 {
            return
        }
        StartMutation(
            async () -> {
                let svc = queueServiceFactory()
                await svc.ClearAsync().ConfigureAwait(false)
                entries = Array.Empty[QueueEntry]()
                cursor = 0
            },
            "Queue cleared."
        )
    }

    private async func SubmitEntryAsync(entry QueueEntry) {
        let job = jobServiceFactory()
        let req = JobRequest{
            Asin: entry.Asin,
            Title: entry.Title,
            Quality: entry.Quality,
            ProfileAlias: entry.ProfileAlias
        }
        await job.SubmitAsync(req).ConfigureAwait(false)
    }

    private func StartMutation(work async () -> void, msg string?, switchToJobs bool = false) {
        busy = true
        statusMessage = nil
        let _ = Task.Run(
            async () -> {
                try {
                    await work().ConfigureAwait(false)
                    if msg != nil {
                        statusMessage = msg
                    }
                    if switchToJobs {
                        navigator?.SwitchToTab('4')
                    }
                } catch (ex Exception) {
                    statusMessage = "Error: ${ex.Message}"
                } finally {
                    busy = false
                }
            }
        )
    }

    private func AdjustScroll(visibleHeight int32) {
        if cursor < scrollOffset {
            scrollOffset = cursor
        } else if cursor >= scrollOffset + visibleHeight {
            scrollOffset = cursor - visibleHeight + 1
        }
    }

    shared {
        private func Truncate(s string, max int32) string -> if s.Length <= max {
            s
        } else {
            s[.. (Math.Max(1, max - 1))] + "…"
        }
    }
}
