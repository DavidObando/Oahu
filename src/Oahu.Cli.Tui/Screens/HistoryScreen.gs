package Oahu.Cli.Tui.Screens

import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Globalization
import System.Linq
import System.Text.Json
import System.Threading.Tasks

/// History screen (tab 5). Lists terminal-state jobs from `history.jsonl`
/// with paginated navigation, retry, and a JSON detail toggle. Per design
/// TUI-exploration §7.
class HistoryScreen : ITabScreen {
    private let jobServiceFactory() -> IJobService
    private var records IReadOnlyList[JobRecord] = Array.Empty[JobRecord]()
    private var cursor int32
    private var scrollOffset int32
    private var lastListHeight int32 = 20
    private var busy bool
    private var jsonMode bool
    private var statusMessage string?
    private var spinnerTick int32
    private var navigator IAppShellNavigator?

    init(jobServiceFactory() -> IJobService) {
        this.jobServiceFactory = jobServiceFactory ?? throw ArgumentNullException("jobServiceFactory")
    }

    prop Title string -> "History"
    prop NumberKey char -> '5'
    prop NeedsTimedRefresh bool -> busy
    prop Records IReadOnlyList[JobRecord] -> records
    prop Cursor int32 -> cursor

    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get {
            yield KeyValuePair[string, string?]("↑↓", "navigate")
            yield KeyValuePair[string, string?]("PgUp/Dn", "page")
            yield KeyValuePair[string, string?]("Enter/j", "details")
            yield KeyValuePair[string, string?]("r", "retry")
            yield KeyValuePair[string, string?]("Ctrl+R", "reload")
        }
    }

    func OnActivatedAsync(navigator IAppShellNavigator) Task? {
        this.navigator = navigator
        if records.Count == 0 {
            return LoadAsync()
        }
        return nil
    }

    func OnDeactivated() { }

    func Render(width int32, height int32) IRenderable {
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        let success = Tokens.StatusSuccess.Value.ToMarkup()
        let danger = Tokens.StatusError.Value.ToMarkup()
        let warning = Tokens.StatusWarning.Value.ToMarkup()
        let lines = List[IRenderable]{
            Markup("[$primary bold]History[/]  [$secondary](${records.Count} records)[/]"),
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
        if records.Count == 0 {
            lines.Add(Markup("[$tertiary]No history yet. Completed jobs land here.[/]"))
            return Padder(Rows(lines)).Padding(2, 1, 2, 1)
        }
        if jsonMode && cursor < records.Count {
            let rec = records[cursor]
            let json = JsonSerializer.Serialize(rec, JsonSerializerOptions{WriteIndented: true})
            lines.Add(Markup("[$secondary]${Markup.Escape(rec.Title)}[/]"))
            lines.Add(Markup(string.Empty))
            for line in json.Split('\n') {
                lines.Add(Markup("[$tertiary]${Markup.Escape(line.TrimEnd('\r'))}[/]"))
            }
            lines.Add(Markup(string.Empty))
            lines.Add(Markup("[$tertiary](press j to close)[/]"))
            return Padder(Rows(lines)).Padding(2, 0, 2, 0)
        }
        let listHeight = Math.Max(1, height - lines.Count - 2)
        lastListHeight = listHeight
        AdjustScroll(listHeight)
        let end = Math.Min(scrollOffset + listHeight, records.Count)
        for var i = scrollOffset;
        i < end;
        i++ {
            let rec = records[i]
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
            let (icon, color) = switch rec.TerminalPhase {
                case JobPhase.Completed: ("✓", success)
                case JobPhase.Failed: ("✗", danger)
                case JobPhase.Canceled: ("⊘", warning)
                default: ("·", tertiary)
            }
            let when = rec.CompletedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)
            lines.Add(
                Markup(
                    "  $pointer [$color]$icon[/]  [$style]${Markup.Escape(Truncate(rec.Title, width - 38))}[/]  [$tertiary]$when[/]"
                )
            )
        }
        if records.Count > listHeight {
            lines.Add(Markup("[$tertiary]  ↕ ${scrollOffset + 1}–$end of ${records.Count}[/]"))
        }
        return Padder(Rows(lines)).Padding(2, 0, 2, 0)
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        if busy {
            return false
        }
        if jsonMode {
            if (key.Key is ConsoleKey.J or ConsoleKey.Escape or ConsoleKey.Enter) {
                jsonMode = false
                return true
            }
            return false
        }
        switch key.Key {
            case ConsoleKey.UpArrow, ConsoleKey.K {
                cursor = Math.Max(0, cursor - 1)
                return true
            }
            case ConsoleKey.DownArrow {
                cursor = Math.Min(records.Count - 1, Math.Max(0, cursor + 1))
                return true
            }
            case ConsoleKey.PageUp {
                cursor = Math.Max(0, cursor - lastListHeight)
                return true
            }
            case ConsoleKey.PageDown {
                cursor = Math.Min(records.Count - 1, Math.Max(0, cursor + lastListHeight))
                return true
            }
            case ConsoleKey.Home {
                cursor = 0
                return true
            }
            case ConsoleKey.End {
                cursor = Math.Max(0, records.Count - 1)
                return true
            }
            case ConsoleKey.J, ConsoleKey.Enter {
                if records.Count > 0 {
                    jsonMode = true
                }
                return true
            }
            case ConsoleKey.R when(key.Modifiers & ConsoleModifiers.Control) != 0 {
                Reload()
                return true
            }
            case ConsoleKey.R {
                RetrySelected()
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
                    let svc = jobServiceFactory()
                    let list = List[JobRecord]()
                    await for r in svc.ReadHistoryAsync().ConfigureAwait(false) {
                        list.Add(r)
                    }
                    // Newest first.
                    list.Reverse()
                    records = list
                    cursor = 0
                    scrollOffset = 0
                } catch (ex Exception) {
                    statusMessage = "Failed to load history: ${ex.Message}"
                    records = Array.Empty[JobRecord]()
                }
            }
        )
    }

    private func Reload() {
        navigator?.TrackLoad(LoadAsync())
    }

    private func RetrySelected() {
        if cursor < 0 || cursor >= records.Count {
            return
        }
        let rec = records[cursor]
        busy = true
        statusMessage = nil
        let _ = Task.Run(
            async () -> {
                try {
                    let svc = jobServiceFactory()
                    let req = JobRequest{
                        Asin: rec.Asin,
                        Title: rec.Title,
                        Quality: rec.Quality ?? DownloadQuality.High,
                        ProfileAlias: rec.ProfileAlias
                    }
                    await svc.SubmitAsync(req).ConfigureAwait(false)
                    statusMessage = "Resubmitted with current defaults."
                    navigator?.SwitchToTab('4')
                } catch (ex Exception) {
                    statusMessage = "Retry failed: ${ex.Message}"
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
