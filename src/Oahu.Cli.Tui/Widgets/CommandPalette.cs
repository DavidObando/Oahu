using System;
using System.Collections.Generic;
using System.Linq;
using Oahu.Cli.Tui.Shell;
using Oahu.Cli.Tui.Tokens;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public sealed class CommandPalette : IModal
{
    public readonly record struct PaletteVerb(string Verb, string Help);

    private readonly IReadOnlyList<PaletteVerb> verbs;
    private readonly Action<string> run;
    private string query = string.Empty;
    private int cursor;

    public CommandPalette(IReadOnlyList<PaletteVerb> verbs, Action<string> run)
    {
        this.verbs = verbs ?? throw new ArgumentNullException(nameof(verbs));
        this.run = run ?? throw new ArgumentNullException(nameof(run));
    }

    public bool IsComplete { get; private set; }

    public bool WasCancelled { get; private set; }

    private List<PaletteVerb> Filtered => verbs
        .Where(verb => verb.Verb.Contains(query, StringComparison.OrdinalIgnoreCase))
        .ToList();

    public bool HandleKey(ConsoleKeyInfo key)
    {
        var matches = Filtered;
        switch (key.Key)
        {
            case ConsoleKey.Enter:
                var chosen = matches.Count > 0
                    ? matches[Math.Clamp(cursor, 0, matches.Count - 1)].Verb
                    : query;
                IsComplete = true;
                if (!string.IsNullOrWhiteSpace(chosen))
                {
                    run(chosen.Trim());
                }
                else
                {
                    WasCancelled = true;
                }
                return true;
            case ConsoleKey.Escape:
                IsComplete = true;
                WasCancelled = true;
                return true;
            case ConsoleKey.UpArrow:
                cursor = Math.Max(0, cursor - 1);
                return true;
            case ConsoleKey.DownArrow:
                cursor = Math.Min(Math.Max(0, matches.Count - 1), cursor + 1);
                return true;
            case ConsoleKey.Tab:
                if (matches.Count > 0)
                {
                    query = matches[Math.Clamp(cursor, 0, matches.Count - 1)].Verb;
                    cursor = 0;
                }
                return true;
            case ConsoleKey.Backspace:
                if (query.Length > 0)
                {
                    query = query[..^1];
                }
                cursor = 0;
                return true;
            default:
                if (key.KeyChar >= ' ' && !char.IsControl(key.KeyChar))
                {
                    query += key.KeyChar;
                    cursor = 0;
                }
                return true;
        }
    }

    public IRenderable Render(int width, int height)
    {
        var brand = Tokens.Tokens.Brand.Value.ToMarkup();
        var primary = Tokens.Tokens.TextPrimary.Value.ToMarkup();
        var tertiary = Tokens.Tokens.TextTertiary.Value.ToMarkup();
        var rows = new List<IRenderable>
        {
            new Markup($"[{brand} bold]Commands[/]"),
            new Markup($"[{brand}]:[/] [{primary}]{Markup.Escape(query)}[/][{tertiary}]▏[/]"),
            new Markup(" "),
        };
        var matches = Filtered;
        if (matches.Count == 0)
        {
            rows.Add(new Markup($"  [{tertiary}]No matching commands[/]"));
        }

        var maxRows = Math.Max(3, height - 7);
        var first = cursor >= maxRows ? cursor - maxRows + 1 : 0;
        var visible = Math.Min(matches.Count - first, maxRows);
        for (var i = first; i < first + visible; i++)
        {
            var selected = i == cursor;
            var caret = selected ? $"[{brand}]❯[/] " : "  ";
            var nameStyle = selected ? $"bold {primary}" : primary;
            rows.Add(new Markup(
                $"{caret}[{nameStyle}]{Markup.Escape(matches[i].Verb)}[/]  " +
                $"[{tertiary}]{Markup.Escape(matches[i].Help)}[/]"));
        }
        if (matches.Count > visible)
        {
            rows.Add(new Markup($"  [{tertiary}]… {matches.Count - visible} more[/]"));
        }
        rows.Add(new Markup(" "));
        rows.Add(new Markup($"[{tertiary}]↑↓ navigate · Tab complete · Enter run · Esc cancel[/]"));
        return new Padder(new Rows(rows)).Padding(2, 1, 2, 1);
    }
}
