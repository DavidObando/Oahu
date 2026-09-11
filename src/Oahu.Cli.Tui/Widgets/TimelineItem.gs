package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Icons
import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Text

/// The semantic state of a (cref:TimelineItem).
enum TimelineState {
    Loading,
    Success,
    Error,
    Warning,
    Info
}

/// One row in a vertical "timeline" (Doctor checks, Jobs phases, etc.). Layout invariant:
/// the status prefix is **always 4 cells wide** (icon + 3 spaces) so swapping
/// `◐` for `✓` never reflows the row — see §6.5 of the design doc.
class TimelineItem {
    init() {
        State = TimelineState.Info
    }

    prop Title string {
        get;
        init;
    }

    prop Description string? {
        get;
        init;
    }

    prop State TimelineState {
        get;
        init;
    }

    prop UseAscii bool {
        get;
        init;
    }

    /// Optional second indented line for additional context.
    prop Detail string? {
        get;
        init;
    }

    func Render() IRenderable {
        let icon = StateIcon(State)
        let glyph = icon.Render(UseAscii)
        // 4-char fixed-width prefix: glyph + 3 spaces. Layout never shifts on state change.
        let prefix = "[${icon.Color.Value.ToMarkup()}]${Markup.Escape(glyph)}[/]   "
        let sb = StringBuilder()
        sb
            .Append(prefix)
            .Append('[')
            .Append(Tokens.TextPrimary.Value.ToMarkup())
            .Append(']')
            .Append(Markup.Escape(Title))
            .Append("[/]")
        if !string.IsNullOrEmpty(Description) {
            sb
                .Append("  ")
                .Append('[')
                .Append(Tokens.TextSecondary.Value.ToMarkup())
                .Append(']')
                .Append(Markup.Escape(Description!!))
                .Append("[/]")
        }
        if !string.IsNullOrEmpty(Detail) {
            sb
                .Append('\n')
                .Append("    ")
                .Append('[')
                .Append(Tokens.TextTertiary.Value.ToMarkup())
                .Append(']')
                .Append(Markup.Escape(Detail!!))
                .Append("[/]")
        }
        return Markup(sb.ToString())
    }

    func Write(console IAnsiConsole) {
        ArgumentNullException.ThrowIfNull(console)
        console.Write(Render())
        console.WriteLine()
    }

    shared {
        private func StateIcon(s TimelineState) Icon -> switch s {
            case TimelineState.Loading: Icons.Working
            case TimelineState.Success: Icons.Success
            case TimelineState.Error: Icons.Error
            case TimelineState.Warning: Icons.Warning
            case TimelineState.Info: Icons.Info
            default: Icons.Info
        }
    }
}
