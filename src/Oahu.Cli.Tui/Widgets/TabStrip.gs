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

    func Render() IRenderable -> Markup(RenderMarkup())

    /// Render to a raw markup string so the shell can compose the strip into a
    /// larger single-line header.
    func RenderMarkup() string {
        // The active tab is a filled "pill" (canvas-coloured text on the
        // Selected token); when the theme paints no backgrounds (Mono), fall
        // back to inverse video so the active tab stays visible without colour.
        let hasBackdrop = Tokens.HasBackdrop
        let sb = StringBuilder()
        for var i = 0; i < Titles.Count; i++ {
            let num = (i + 1).ToString(CultureInfo.InvariantCulture)
            let label = num + " " + Titles[i].ToLowerInvariant()
            if i > 0 {
                sb.Append(' ')
            }
            if i == ActiveIndex {
                if hasBackdrop {
                    sb
                        .Append('[')
                        .Append(Tokens.Canvas.Value.ToMarkup())
                        .Append(" on ")
                        .Append(Tokens.Selected.Value.ToMarkup())
                        .Append(" bold]")
                } else {
                    sb.Append("[invert bold]")
                }
                sb.Append(' ').Append(Markup.Escape(label)).Append(' ').Append("[/]")
            } else {
                sb
                    .Append('[')
                    .Append(Tokens.TextTertiary.Value.ToMarkup())
                    .Append("] ")
                    .Append(Markup.Escape(num))
                    .Append("[/] [")
                    .Append(Tokens.TextSecondary.Value.ToMarkup())
                    .Append(']')
                    .Append(Markup.Escape(Titles[i].ToLowerInvariant()))
                    .Append(" [/]")
            }
        }
        return sb.ToString()
    }

    func Write(console IAnsiConsole) {
        ArgumentNullException.ThrowIfNull(console)
        console.Write(Render())
        console.WriteLine()
    }

    /// Map a 0-based column offset within the strip to a tab index, or -1
    /// when the column falls on a separator / past the last tab. Mirrors the
    /// layout maths of (cref:RenderMarkup): every entry renders as
    /// `" <num> <title> "` (active and inactive have identical plain widths),
    /// with one separator space between entries.
    func HitTest(x int32) int32 {
        if x < 0 {
            return -1
        }
        var pos = 0
        for var i = 0; i < Titles.Count; i++ {
            if i > 0 {
                pos += 1
            }
            let numLen = (i + 1).ToString(CultureInfo.InvariantCulture).Length
            let entryWidth = 1 + numLen + 1 + Titles[i].Length + 1
            if x >= pos && x < pos + entryWidth {
                return i
            }
            pos += entryWidth
        }
        return -1
    }
}
