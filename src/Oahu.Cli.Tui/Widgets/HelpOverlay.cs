using System;
using System.Collections.Generic;
using Oahu.Cli.Tui.Shell;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public sealed class HelpOverlay : IModal
{
    private const int KeyColumnWidth = 10;

    public readonly record struct HelpSection(
        string Title,
        IReadOnlyList<(string Key, string Action)> Entries);

    private readonly IReadOnlyList<HelpSection> _sections;

    public HelpOverlay(IReadOnlyList<HelpSection> sections)
    {
        _sections = sections ?? throw new ArgumentNullException(nameof(sections));
    }

    public bool IsComplete { get; private set; }

    public bool WasCancelled { get; private set; }

    public bool HandleKey(ConsoleKeyInfo key)
    {
        IsComplete = true;
        WasCancelled = true;
        return true;
    }

    public IRenderable Render(int width, int height)
    {
        var brand = Tokens.Tokens.Brand.Value.ToMarkup();
        var primary = Tokens.Tokens.TextPrimary.Value.ToMarkup();
        var secondary = Tokens.Tokens.TextSecondary.Value.ToMarkup();
        var tertiary = Tokens.Tokens.TextTertiary.Value.ToMarkup();
        var rows = new List<IRenderable> { new Markup($"[{brand} bold]Keys[/]") };
        foreach (var section in _sections)
        {
            rows.Add(new Markup(" "));
            rows.Add(new Markup($"[{secondary} bold]{Markup.Escape(section.Title)}[/]"));
            foreach (var entry in section.Entries)
            {
                var paddedKey = entry.Key.PadRight(KeyColumnWidth);
                rows.Add(new Markup(
                    $"  [{brand}]{Markup.Escape(paddedKey)}[/] [{primary}]{Markup.Escape(entry.Action)}[/]"));
            }
        }
        rows.Add(new Markup(" "));
        rows.Add(new Markup($"[{tertiary}]any key to close[/]"));
        return new Padder(new Rows(rows)).Padding(2, 1, 2, 1);
    }
}
