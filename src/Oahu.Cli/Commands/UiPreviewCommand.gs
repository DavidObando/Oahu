package Oahu.Cli.Commands

import Oahu.Cli.App.Errors
import Oahu.Cli.Tui.Hooks
import Oahu.Cli.Tui.Icons
import Oahu.Cli.Tui.Themes
import Oahu.Cli.Tui.Tokens
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.Linq

/// Hidden helper command (`oahu-cli ui-preview`) that renders every Phase 2 widget
/// under the requested theme. Used by snapshot tests and by humans visually auditing
/// theme additions. Per design §13, this stays available post-1.0 (gated behind a
/// hidden / experimental flag) — we wire it as a regular but undocumented subcommand
/// here so System.CommandLine can still surface it via tab completion in dev shells.
class UiPreviewCommand {
    shared {
        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let themeOpt = Option[string]("--theme"){
                Description = "Theme to render: " + string.Join(", ", Theme.AvailableNames())
            }
            themeOpt.AcceptOnlyFromAmong(Theme.AvailableNames().ToArray())
            themeOpt.DefaultValueFactory = (_ ArgumentResult) -> "Default"
            let allThemesOpt = Option[bool]("--all-themes"){Description = "Render the preview once per built-in theme."}
            let cmd = Command(
                "ui-preview",
                "Render every TUI widget under the current theme (developer / snapshot tool)."
            ){themeOpt, allThemesOpt}
            cmd.Hidden = true
            cmd.SetAction(
                (parse ParseResult) -> {
                    let globals = resolveGlobals(parse)
                    let allThemes = parse.GetValue(allThemesOpt)
                    let themeName = parse.GetValue(themeOpt) ?? "Default"
                    let console = SpectreConsoleFactory.Create(globals)
                    let themesToRender = if allThemes {
                        Theme.Available.ToList()
                    } else {
                        List[Theme]{ResolveTheme(themeName)}
                    }
                    for theme in themesToRender {
                        Theme.Use(theme.Name)
                        RenderPreview(console, theme.Name, globals.UseAscii)
                        console.WriteLine()
                    }
                    // Reset to Default so the next command isn't affected by the preview.
                    Theme.Reset()
                    return ExitCodes.Success
                }
            )
            return cmd
        }

        private func ResolveTheme(name string) Theme {
            for t in Theme.Available {
                if string.Equals(t.Name, name, StringComparison.OrdinalIgnoreCase) {
                    return t
                }
            }
            return Themes.Default
        }

        private func RenderPreview(console IAnsiConsole, themeName string, useAscii bool) {
            let rule = Rule("[bold]${Markup.Escape("Theme: $themeName")}[/]"){Justification = Justify.Left}
            console.Write(rule)
            console.WriteLine()
            // Hooks summary
            let size = TerminalSize(console)
            let bp = Breakpoint.For(size)
            console.MarkupLine(
                "[grey]Width:[/] ${size.Width}  [grey]Height:[/] ${size.Height}  [grey]Breakpoint:[/] $bp  [grey]SSH:[/] ${SshDetector.IsSshSession()}  [grey]ScreenReader:[/] ${ScreenReaderProbe.IsActive()}"
            )
            console.WriteLine()
            // Icons
            console.MarkupLine("[bold]Icons[/]")
            let icons = []Icon{
                Icons.Success,
                Icons.Error,
                Icons.Warning,
                Icons.Info,
                Icons.Disabled,
                Icons.Prompt,
                Icons.Filled,
                Icons.Working,
                Icons.Empty,
                Icons.ArrowRight,
                Icons.ArrowUp,
                Icons.ArrowDown
            }
            for ic in icons {
                console.Markup(
                    "  [${ic.Color.Value.ToMarkup()}]${Markup.Escape(ic.Render(useAscii))}[/] ${ic.ScreenReaderLabel}   "
                )
            }
            console.WriteLine()
            console.WriteLine()
            // StatusLine
            console.MarkupLine("[bold]StatusLine[/]")
            StatusLine{Verb: "Authenticating", Hint: "Esc to cancel", Metric: "1.2 KB", UseAscii: useAscii}.Write(
                console
            )
            console.WriteLine()
            // TimelineItems
            console.MarkupLine("[bold]TimelineItem (each row begins with the same 4-cell prefix — never reflows)[/]")
            TimelineItem{
                Title: "Output dir writable",
                Description: "~/Music/Oahu/Downloads",
                State: TimelineState.Success,
                UseAscii: useAscii
            }.Write(console)
            TimelineItem{Title: "Audible reachable", State: TimelineState.Loading, UseAscii: useAscii}.Write(console)
            TimelineItem{
                Title: "Activation bytes cache",
                Description: "empty — will fetch on first decrypt",
                State: TimelineState.Warning,
                UseAscii: useAscii
            }.Write(console)
            TimelineItem{
                Title: "Library cache",
                Description: "287 books, last sync 2 h ago",
                State: TimelineState.Info,
                UseAscii: useAscii,
                Detail: "→ run 'library sync' to refresh"
            }.Write(console)
            TimelineItem{
                Title: "Decrypt failed",
                Description: "The Way of Kings",
                State: TimelineState.Error,
                UseAscii: useAscii
            }.Write(console)
            console.WriteLine()
            // SelectList
            console.MarkupLine("[bold]SelectList[/]")
            SelectList[string]{
                Items: []string{"Project Hail Mary", "The Three-Body Problem", "Artemis", "The Way of Kings"},
                Format: (s string) -> s,
                CursorIndex: 1,
                SelectedIndices: HashSet[int32]{0, 2},
                UseAscii: useAscii
            }.Write(console)
            console.WriteLine()
            // StyledTable
            console.MarkupLine("[bold]StyledTable[/]")
            let table = StyledTable
                .Create(useAscii)
                .AddBoldColumn("Title")
                .AddBoldColumn("Author")
                .AddBoldColumn("Length", noWrap: true)
            table.AddRow("Project Hail Mary", "Andy Weir", "16h 10m")
            table.AddRow("The Three-Body Problem", "Liu Cixin", "13h 26m")
            console.Write(table)
            console.WriteLine()
            // HintBar
            console.MarkupLine("[bold]HintBar[/]")
            let hints = HintBar{UseAscii: useAscii}
                .Add("1-6", "tabs")
                .Add("Tab", "next")
                .Add("/", "search")
                .Add(":", "palette")
                .Add("?", "help")
                .Add("Ctrl+C", "quit")
            hints.Write(console)
            console.WriteLine()
            // Dialog (composes everything above)
            console.MarkupLine("[bold]Dialog[/]")
            let dialogBody = Markup((`[` + "${Tokens.TextPrimary.Value.ToMarkup()}" + `]The Audible API returned 401 Unauthorized.[/]

[` + "${Tokens.TextSecondary.Value.ToMarkup()}" + `]Your session may have expired. Sign in again and retry.[/]`))
            let dialogFooter = HintBar{UseAscii: useAscii}
                .Add("Tab", "buttons")
                .Add("Enter", "activate")
                .Add("L", "logs")
                .Add("Esc", "dismiss")
            Dialog{Title: "Couldn't sync library", Body: dialogBody, Footer: dialogFooter, UseAscii: useAscii}.Write(
                console
            )
            console.WriteLine()
        }
    }
}
