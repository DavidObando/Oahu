package Oahu.Cli.Tui.Auth

import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Tokens
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic

/// Region picker modal for sign-in step 1.
class RegionPickerModal : Oahu.Cli.Tui.Shell.IModal[string] {
    private var cursor int32

    prop IsComplete bool {
        get;
        private set;
    }

    prop WasCancelled bool {
        get;
        private set;
    }

    prop Result string? {
        get;
        private set;
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        switch key.Key {
            case ConsoleKey.UpArrow, ConsoleKey.K {
                cursor = Math.Max(0, cursor - 1)
                return true
            }
            case ConsoleKey.DownArrow, ConsoleKey.J {
                cursor = Math.Min(Regions.Length - 1, cursor + 1)
                return true
            }
            case ConsoleKey.Enter {
                Result = Regions[cursor].Code
                IsComplete = true
                return true
            }
            case ConsoleKey.Escape {
                WasCancelled = true
                IsComplete = true
                return true
            }
            default {
                let _ = 0
            }
        }
        return false
    }

    func Render(width int32, height int32) IRenderable {
        let lines = List[IRenderable]()
        lines.Add(Markup("[${Tokens.TextPrimary.Value.ToMarkup()} bold]Sign in to Audible[/]"))
        lines.Add(Markup(string.Empty))
        lines.Add(Markup("[${Tokens.TextSecondary.Value.ToMarkup()}]Choose your Audible region:[/]"))
        lines.Add(Markup(string.Empty))
        for var i = 0;
        i < Regions.Length;
        i++ {
            let (code, name) = Regions[i]
            let prefix = if i == cursor {
                "[${Tokens.Brand.Value.ToMarkup()}]  ❯ [/]"
            } else {
                "    "
            }
            let style = if i == cursor {
                Tokens.TextPrimary.Value.ToMarkup()
            } else {
                Tokens.TextSecondary.Value.ToMarkup()
            }
            lines.Add(
                Markup(
                    "$prefix[$style]${Markup.Escape(name)}[/]  [${Tokens.TextTertiary.Value.ToMarkup()}](${Markup.Escape(code)})[/]"
                )
            )
        }
        lines.Add(Markup(string.Empty))
        let bar = HintBar().Add("↑↓", "select").Add("Enter", "continue").Add("Esc", "cancel")
        lines.Add(bar.Render())
        return Padder(Rows(lines)).Padding(4, 1, 4, 1)
    }

    shared {
        private let Regions[](Code string, Name string) = [](string, string){
            ("us", "United States"),
            ("uk", "United Kingdom"),
            ("de", "Germany"),
            ("fr", "France"),
            ("jp", "Japan"),
            ("ca", "Canada"),
            ("au", "Australia"),
            ("it", "Italy"),
            ("es", "Spain"),
            ("in", "India"),
            ("br", "Brazil")
        }
    }
}
