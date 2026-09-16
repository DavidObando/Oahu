package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Linq

/// The `:` command palette. Fuzzy-filters verbs; Enter runs the selected verb
/// through a caller-supplied callback. Mirrors command-mode vocabulary so
/// muscle memory transfers between the TUI and scripts.
class CommandPalette : Oahu.Cli.Tui.Shell.IModal {
    /// A palette entry: the verb the user runs and a one-line description.
    data struct PaletteVerb(Verb string, Help string)

    private let verbs IReadOnlyList[PaletteVerb]
    private let run(string) -> void
    private var query string = string.Empty
    private var cursor int32

    init(verbs IReadOnlyList[PaletteVerb], run(string) -> void) {
        this.verbs = verbs ?? throw ArgumentNullException("verbs")
        this.run = run ?? throw ArgumentNullException("run")
    }

    prop IsComplete bool {
        get;
        private set;
    }

    prop WasCancelled bool {
        get;
        private set;
    }

    private prop Filtered List[PaletteVerb] -> verbs
        .Where((v PaletteVerb) -> v.Verb.Contains(query, StringComparison.OrdinalIgnoreCase))
        .ToList()

    func HandleKey(key ConsoleKeyInfo) bool {
        let matches = Filtered
        switch key.Key {
            case ConsoleKey.Enter {
                let chosen = if matches.Count > 0 {
                    matches[Math.Clamp(cursor, 0, matches.Count - 1)].Verb
                } else {
                    query
                }
                IsComplete = true
                if !string.IsNullOrWhiteSpace(chosen) {
                    run(chosen.Trim())
                } else {
                    WasCancelled = true
                }
                return true
            }
            case ConsoleKey.Escape {
                IsComplete = true
                WasCancelled = true
                return true
            }
            case ConsoleKey.UpArrow {
                cursor = Math.Max(0, cursor - 1)
                return true
            }
            case ConsoleKey.DownArrow {
                cursor = Math.Min(Math.Max(0, matches.Count - 1), cursor + 1)
                return true
            }
            case ConsoleKey.Tab {
                if matches.Count > 0 {
                    query = matches[Math.Clamp(cursor, 0, matches.Count - 1)].Verb
                    cursor = 0
                }
                return true
            }
            case ConsoleKey.Backspace {
                if query.Length > 0 {
                    query = query[.. (query.Length - 1)]
                }
                cursor = 0
                return true
            }
            default {
                if key.KeyChar >= ' ' && !char.IsControl(key.KeyChar) {
                    query += key.KeyChar.ToString()
                    cursor = 0
                }
                return true
            }
        }
    }

    func Render(width int32, height int32) IRenderable {
        let brand = Tokens.Brand.Value.ToMarkup()
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let rows = List[IRenderable]{
            Markup("[$brand bold]Commands[/]"),
            Markup("[$brand]:[/] [$primary]${Markup.Escape(query)}[/][$tertiary]▏[/]"),
            Markup(" ")
        }
        let matches = Filtered
        if matches.Count == 0 {
            rows.Add(Markup("  [$tertiary]No matching commands[/]"))
        }
        // Cap the visible list so tall verb sets never overflow the overlay.
        let maxRows = Math.Max(3, height - 7)
        var first = 0
        if cursor >= maxRows {
            first = cursor - maxRows + 1
        }
        let visible = Math.Min(matches.Count - first, maxRows)
        for var i = first;
        i < first + visible;
        i++ {
            let isSel = i == cursor
            let caret = if isSel {
                "[$brand]❯[/] "
            } else {
                "  "
            }
            let nameStyle = if isSel {
                "bold $primary"
            } else {
                primary
            }
            rows.Add(
                Markup(
                    "$caret[$nameStyle]${Markup.Escape(matches[i].Verb)}[/]  [$tertiary]${Markup.Escape(matches[i].Help)}[/]"
                )
            )
        }
        if matches.Count > visible {
            rows.Add(Markup("  [$tertiary]… ${matches.Count - visible} more[/]"))
        }
        rows.Add(Markup(" "))
        rows.Add(Markup("[$tertiary]↑↓ navigate · Tab complete · Enter run · Esc cancel[/]"))
        return Padder(Rows(rows)).Padding(2, 1, 2, 1)
    }
}
