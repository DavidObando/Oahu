package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic

/// The `?` help overlay: a keymap cheat sheet built from the global bindings
/// plus the active screen's hints. Any key dismisses it.
class HelpOverlay : Oahu.Cli.Tui.Shell.IModal {
    /// One section of the cheat sheet: a heading plus `(key, action)` rows.
    data struct HelpSection(Title string, Entries IReadOnlyList[(Key string, Action string)])

    private let sections IReadOnlyList[HelpSection]

    init(sections IReadOnlyList[HelpSection]) {
        this.sections = sections ?? throw ArgumentNullException("sections")
    }

    prop IsComplete bool {
        get;
        private set;
    }

    prop WasCancelled bool {
        get;
        private set;
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        IsComplete = true
        WasCancelled = true
        return true
    }

    func Render(width int32, height int32) IRenderable {
        let brand = Tokens.Brand.Value.ToMarkup()
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let rows = List[IRenderable]{
            Markup("[$brand bold]Keys[/]")
        }
        for section in sections {
            rows.Add(Markup(" "))
            rows.Add(Markup("[$secondary bold]${Markup.Escape(section.Title)}[/]"))
            for entry in section.Entries {
                let paddedKey = entry.Key.PadRight(KeyColumnWidth)
                rows.Add(Markup("  [$brand]${Markup.Escape(paddedKey)}[/] [$primary]${Markup.Escape(entry.Action)}[/]"))
            }
        }
        rows.Add(Markup(" "))
        rows.Add(Markup("[$tertiary]any key to close[/]"))
        return Padder(Rows(rows)).Padding(2, 1, 2, 1)
    }

    shared {
        private const KeyColumnWidth int32 = 10
    }
}
