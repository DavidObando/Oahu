package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Text

/// The pinned footer that shows contextual key bindings. Built from a
/// `(key, action)` dictionary so screens can mutate hints without
/// touching markup. Empty / null values are filtered out — that lets a
/// caller pass an exhaustive set and conditionally clear entries.
class HintBar {
    init() {
        Separator = "·"
    }

    private let hints List[(Key string, Action string)] = List[(Key string, Action string)]()

    prop UseAscii bool {
        get;
        init;
    }

    prop Separator string {
        get;
        init;
    }

    /// When set, trailing hints that would overflow this many cells are
    /// dropped instead of wrapping (the `?` overlay still lists everything).
    prop MaxWidth int32? {
        get;
        set;
    }

    func Add(key string, action string?) HintBar {
        if string.IsNullOrWhiteSpace(action) {
            return this
        }
        hints.Add((key, action))
        return this
    }

    func AddRange(source IEnumerable[KeyValuePair[string, string?]]) HintBar {
        ArgumentNullException.ThrowIfNull(source)
        for kv in source {
            Add(kv.Key, kv.Value)
        }
        return this
    }

    func Render() IRenderable {
        if hints.Count == 0 {
            return Markup(string.Empty)
        }
        let sep = if UseAscii {
            "|"
        } else {
            Separator
        }
        let sb = StringBuilder()
        var used = 0
        for var i = 0;
        i < hints.Count;
        i++ {
            if MaxWidth is {} max {
                // Plain-cell cost of this hint: "key action" plus " · " when
                // it is not the first entry.
                let cost = hints[i].Key.Length + 1 + hints[i].Action.Length + (
                    if i > 0 {
                        sep.Length + 2
                    } else {
                        0
                    }
                )
                if used + cost > max {
                    break
                }
                used += cost
            }
            if i > 0 {
                sb
                    .Append(' ')
                    .Append('[')
                    .Append(Tokens.TextTertiary.Value.ToMarkup())
                    .Append(']')
                    .Append(Markup.Escape(sep))
                    .Append("[/] ")
            }
            sb
                .Append('[')
                .Append(Tokens.Brand.Value.ToMarkup())
                .Append(']')
                .Append(Markup.Escape(hints[i].Key))
                .Append("[/] ")
                .Append('[')
                .Append(Tokens.TextSecondary.Value.ToMarkup())
                .Append(']')
                .Append(Markup.Escape(hints[i].Action))
                .Append("[/]")
        }
        return Markup(sb.ToString())
    }

    func Write(console IAnsiConsole) {
        ArgumentNullException.ThrowIfNull(console)
        console.Write(Render())
        console.WriteLine()
    }
}
