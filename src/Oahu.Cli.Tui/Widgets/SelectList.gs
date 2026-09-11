package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Icons
import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Text

/// Render-only listing of a keyboard-navigable list. The interactive prompt
/// lives in Phase 6 (it needs the AppShell input loop). Phase 2 ships the
/// presentation layer so screens can render selection state from any source —
/// queue order, library books, theme picker, etc.
class SelectList[T] {
    init() {
        CursorIndex = -1
    }

    prop Items IReadOnlyList[T] {
        get;
        init;
    }

    prop Format(T) -> string {
        get;
        init;
    }

    prop CursorIndex int32 {
        get;
        init;
    }

    prop SelectedIndices IReadOnlySet[int32]? {
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
        i < Items.Count;
        i++ {
            if i > 0 {
                sb.Append('\n')
            }
            let prompt = Icons.Prompt.Render(UseAscii)
            let filled = Icons.Filled.Render(UseAscii)
            let empty = Icons.Empty.Render(UseAscii)
            // 4-char fixed-width prefix: cursor + selection + 2 spaces.
            let cursor = if i == CursorIndex {
                "[${Tokens.Brand.Value.ToMarkup()}]${Markup.Escape(prompt)}[/]"
            } else {
                " "
            }
            let selected = if SelectedIndices != nil && SelectedIndices!!.Contains(i) {
                "[${Tokens.StatusSuccess.Value.ToMarkup()}]${Markup.Escape(filled)}[/]"
            } else {
                "[${Tokens.TextTertiary.Value.ToMarkup()}]${Markup.Escape(empty)}[/]"
            }
            sb.Append(cursor).Append(' ').Append(selected).Append("  ")
            let label = Format(Items[i])
            let colour = if i == CursorIndex {
                Tokens.Selected
            } else {
                Tokens.TextPrimary
            }
            sb.Append('[').Append(colour.Value.ToMarkup()).Append(']').Append(Markup.Escape(label)).Append("[/]")
        }
        return Markup(sb.ToString())
    }

    func Write(console IAnsiConsole) {
        ArgumentNullException.ThrowIfNull(console)
        console.Write(Render())
        console.WriteLine()
    }
}
