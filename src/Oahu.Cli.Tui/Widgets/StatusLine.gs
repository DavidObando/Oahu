package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Icons
import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Text

/// Single-line "spinner + verb + hint + optional metric" widget used for opaque waits.
///
/// Per design §6.6.1, the indicator is a static `◐` in Phase 2 (no live spinner —
/// that needs the AppShell render loop, which lands in Phase 6). The verb + hint pair
/// is what carries the information, so layout / colour are correct from day one.
class StatusLine {
    init() {
        Verb = string.Empty
    }

    prop Verb string {
        get;
        init;
    }

    prop Hint string? {
        get;
        init;
    }

    prop Metric string? {
        get;
        init;
    }

    prop Indicator Icon? {
        get;
        init;
    }

    prop UseAscii bool {
        get;
        init;
    }

    /// Render to a Spectre (cref:IRenderable) for use inside layouts.
    func Render() IRenderable {
        let ind = (Indicator ?? Icons.Working).Render(UseAscii)
        let indCol = (Indicator ?? Icons.Working).Color
        let sb = StringBuilder()
        sb
            .Append('[')
            .Append(indCol.Value.ToMarkup())
            .Append(']')
            .Append(Markup.Escape(ind))
            .Append("[/]")
            .Append(' ')
            .Append('[')
            .Append(Tokens.TextPrimary.Value.ToMarkup())
            .Append(']')
            .Append(Markup.Escape(Verb))
            .Append("[/]")
        if !string.IsNullOrEmpty(Hint) {
            sb
                .Append(' ')
                .Append('[')
                .Append(Tokens.TextTertiary.Value.ToMarkup())
                .Append(']')
                .Append("· ")
                .Append(Markup.Escape(Hint!!))
                .Append("[/]")
        }
        if !string.IsNullOrEmpty(Metric) {
            sb
                .Append(' ')
                .Append('[')
                .Append(Tokens.TextSecondary.Value.ToMarkup())
                .Append(']')
                .Append("· ")
                .Append(Markup.Escape(Metric!!))
                .Append("[/]")
        }
        return Markup(sb.ToString())
    }

    /// Convenience: render directly to [`console`](paramref).
    func Write(console IAnsiConsole) {
        ArgumentNullException.ThrowIfNull(console)
        console.Write(Render())
        console.WriteLine()
    }
}
