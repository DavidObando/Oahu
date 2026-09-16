package Oahu.Cli.Tui.Screens

import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Tokens
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Globalization
import System.Linq
import System.Threading
import System.Threading.Tasks
import SystemObject = System.Object

/// Jobs screen (tab 4). Shows live in-flight jobs, each with current phase,
/// per-phase progress, and an aggregate OSC 9;4 progress emitted to the
/// terminal. Per design TUI-exploration §6.
class JobsScreen : ITabScreen, ITerminalProgressProvider {
    private let jobServiceFactory() -> IJobService
    private let gate object = SystemObject()
    private let snapshots Dictionary[string, JobSnapshot] = Dictionary[string, JobSnapshot](StringComparer.Ordinal)
    private let order List[string] = List[string]()
    private var observerCts CancellationTokenSource?
    private var observerTask Task?
    private var cursor int32
    private var statusMessage string?

    init(jobServiceFactory() -> IJobService) {
        this.jobServiceFactory = jobServiceFactory ?? throw ArgumentNullException("jobServiceFactory")
    }

    prop Title string -> "Jobs"
    prop NumberKey char -> '4'

    /// Always true while observer is running so externally-started jobs render promptly.
    prop NeedsTimedRefresh bool -> observerCts != nil && !observerCts!!.IsCancellationRequested

    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get {
            yield KeyValuePair[string, string?]("↑↓", "navigate")
            yield KeyValuePair[string, string?]("c", "cancel")
        }
    }

    prop Snapshots IReadOnlyList[JobSnapshot] {
        get {
            lock gate {
                return order.Select((id string) -> snapshots[id]).ToArray()
            }
        }
    }

    func OnActivated(navigator IAppShellNavigator) {
        if observerCts != nil {
            return
        }
        // Seed from ListActive() so jobs that started before the user
        // navigated to this tab are visible immediately.
        try {
            let svc = jobServiceFactory()
            let active = svc.ListActive()
            lock gate {
                snapshots.Clear()
                order.Clear()
                for s in active {
                    snapshots[s.JobId] = s
                    order.Add(s.JobId)
                }
            }
            observerCts = CancellationTokenSource()
            let token = observerCts!!.Token
            observerTask = Task.Run(
                func () Task? {
                    return ObserveAsync(svc, token)
                },
                token
            )
        } catch (ex Exception) {
            statusMessage = "Failed to start observer: ${ex.Message}"
        }
    }

    func OnDeactivated() {
        StopObserver()
    }

    func OnShutdown() {
        StopObserver()
    }

    private func StopObserver() {
        try {
            observerCts?.Cancel()
        } catch {
            // ignore

        }
        observerCts = nil
        observerTask = nil
    }

    private async func ObserveAsync(svc IJobService, ct CancellationToken) {
        try {
            await for update in svc.ObserveAll(ct).WithCancellation(ct).ConfigureAwait(false) {
                Apply(svc, update)
            }
        } catch (OperationCanceledException) {
            // expected on tab deactivate / shutdown

        } catch (ex Exception) {
            statusMessage = "Observer error: ${ex.Message}"
        }
    }

    private func Apply(svc IJobService, update JobUpdate) {
        // JobUpdate carries no Title/Asin — re-fetch a fresh snapshot. Note
        // GetSnapshot may return null after the scheduler has rolled the
        // job to history; in that case keep the last-known snapshot but
        // overlay the terminal phase so the row reflects completion.
        let fresh JobSnapshot? = svc.GetSnapshot(update.JobId)
        lock gate {
            if fresh != nil {
                if !snapshots.ContainsKey(update.JobId) {
                    order.Add(update.JobId)
                }
                snapshots[update.JobId] = fresh
            } else if snapshots.TryGetValue(update.JobId, out var prev) {
                snapshots[update.JobId] = prev with{
                    Phase = update.Phase,
                    Progress = update.Progress,
                    Message = update.Message,
                    UpdatedAt = update.Timestamp
                }
            }
            // else: terminal update for a job we never saw — drop.

        }
    }

    func Render(width int32, height int32) IRenderable {
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        var snap IReadOnlyList[JobSnapshot]
        lock gate {
            snap = order.Select((id string) -> snapshots[id]).ToArray()
        }
        let lines = List[IRenderable]{
            Markup("[$primary bold]Jobs[/]  [$secondary](${snap.Count} active)[/]"),
            Markup(string.Empty)
        }
        if !string.IsNullOrEmpty(statusMessage) {
            lines.Add(Markup("[$tertiary]${Markup.Escape(statusMessage!!)}[/]"))
            lines.Add(Markup(string.Empty))
        }
        if snap.Count == 0 {
            lines.Add(Markup("[$tertiary]No jobs running. Submit one from the Library or Queue tab.[/]"))
            return Padder(Rows(lines)).Padding(2, 1, 2, 1)
        }
        if cursor >= snap.Count {
            cursor = snap.Count - 1
        }
        if cursor < 0 {
            cursor = 0
        }
        for var i = 0; i < snap.Count; i++ {
            let s = snap[i]
            let pointer = if i == cursor {
                "[$brand]❯[/]"
            } else {
                " "
            }
            let item = TimelineItem{
                Title: Truncate(s.Title, width - 30),
                Description: "${s.Phase} · ${RenderProgressBar(s.Progress)} ${FormatPercent(s.Progress)}",
                Detail: s.Message,
                State: MapState(s.Phase)
            }
            lines.Add(Markup("  $pointer "))
            lines.Add(item.Render())
        }
        return Padder(Rows(lines)).Padding(2, 0, 2, 0)
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        var snap IReadOnlyList[JobSnapshot]
        lock gate {
            snap = order.Select((id string) -> snapshots[id]).ToArray()
        }
        switch key.Key {
            case ConsoleKey.UpArrow, ConsoleKey.K {
                cursor = Math.Max(0, cursor - 1)
                return true
            }
            case ConsoleKey.DownArrow, ConsoleKey.J {
                cursor = Math.Min(snap.Count - 1, Math.Max(0, cursor + 1))
                return true
            }
            case ConsoleKey.C when key.Modifiers == 0 {
                if cursor >= 0 && cursor < snap.Count {
                    let id = snap[cursor].JobId
                    let ok = jobServiceFactory().Cancel(id)
                    statusMessage = if ok {
                        "Cancellation requested."
                    } else {
                        "Job not found."
                    }
                }
                return true
            }
            default {
                let _ = 0
            }
        }
        return false
    }

    /// ```xmldoc
    /// <inheritdoc />
    /// ```
    func GetTerminalProgressSequence() string {
        var snap IReadOnlyList[JobSnapshot]
        lock gate {
            snap = order.Select((id string) -> snapshots[id]).ToArray()
        }
        var hasFailure = false
        var totals = 0d
        var count = 0
        for s in snap {
            if s.Phase == JobPhase.Completed || s.Phase == JobPhase.Canceled {
                continue
            }
            if s.Phase == JobPhase.Failed {
                hasFailure = true
                continue
            }
            totals += AggregateProgress(s.Phase, s.Progress)
            count++
        }
        if hasFailure && count == 0 {
            return "\u001B]9;4;2;100\u001B\\"
        }
        if count == 0 {
            return AppShell.TerminalProgressClearSequence
        }
        let pct = int32(Math.Clamp(totals / float64(count) * float64(100.0), 0.0, 100.0))
        let state = if hasFailure {
            2
        } else {
            1
        }
        return string.Create(CultureInfo.InvariantCulture, "\u001B]9;4;$state;$pct\u001B\\")
    }

    shared {
        /// Phase-weighted aggregate in [0,1] used for OSC 9;4.
        private func AggregateProgress(phase JobPhase, p float64?) float64 {
            let v = Math.Clamp(p ?? 0d, 0d, 1d)
            return switch phase {
                case JobPhase.Queued: 0d
                case JobPhase.Licensing: 0.05 + 0.10 * v
                case JobPhase.Downloading: 0.15 + 0.55 * v
                case JobPhase.Decrypting: 0.70 + 0.20 * v
                case JobPhase.Exporting: 0.90 + 0.10 * v
                case JobPhase.Completed: 1d
                default: 0d
            }
        }

        private func MapState(p JobPhase) TimelineState -> switch p {
            case JobPhase.Completed: TimelineState.Success
            case JobPhase.Failed: TimelineState.Error
            case JobPhase.Canceled: TimelineState.Warning
            default: TimelineState.Loading
        }

        private func RenderProgressBar(p float64?) string {
            const width = 20
            let v = Math.Clamp(p ?? 0d, 0d, 1d)
            let filled = int32(Math.Round(float64(width) * v))
            return String('█', filled) + String('░', width - filled)
        }

        private func FormatPercent(p float64?) string -> if p is {} v {
            string.Create(CultureInfo.InvariantCulture, "${int32(Math.Round(v * float64(100.0))),3}%")
        } else {
            "  …"
        }

        private func Truncate(s string, max int32) string -> if s.Length <= max {
            s
        } else {
            s[.. (Math.Max(1, max - 1))] + "…"
        }
    }
}
