package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Globalization
import System.Text

/// The top tab strip. Renders a single horizontal row of
/// `1 Home 2 Library 3 Queue …` with the active tab painted in the
/// `Selected` token.
class TabStrip {
    prop Titles IReadOnlyList[string] {
        get;
        init;
    }

    prop ActiveIndex int32 {
        get;
        init;
    }

    prop UseAscii bool {
        get;
        init;
    }

    func Render() IRenderable {
        let sb = StringBuilder()
        for var i = 0;
        i < Titles.Count;
        i++ {
            let num = (i + 1).ToString(CultureInfo.InvariantCulture)
            let label = num + " " + Titles[i]
            if i > 0 {
                sb.Append("  ")
            }
            if i == ActiveIndex {
                sb
                    .Append('[')
                    .Append(Tokens.Selected.Value.ToMarkup())
                    .Append(" bold]")
                    .Append(' ')
                    .Append(Markup.Escape(label))
                    .Append(' ')
                    .Append("[/]")
            } else {
                sb
                    .Append('[')
                    .Append(Tokens.TextSecondary.Value.ToMarkup())
                    .Append(']')
                    .Append(' ')
                    .Append(Markup.Escape(label))
                    .Append(' ')
                    .Append("[/]")
            }
        }
        return Markup(sb.ToString())
    }

    func Write(console IAnsiConsole) {
        ArgumentNullException.ThrowIfNull(console)
        console.Write(Render())
        console.WriteLine()
    }
}
