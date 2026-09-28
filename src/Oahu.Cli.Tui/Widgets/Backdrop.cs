using System;
using System.Collections.Generic;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public sealed class Backdrop : IRenderable
{
    private const string AccentGlyph = "▏";
    private readonly IRenderable child;
    private readonly Color background;
    private readonly Color? accent;
    private readonly int padLeft;
    private readonly int padRight;
    private readonly int padTop;
    private readonly int padBottom;
    private readonly int minHeight;

    public Backdrop(
        IRenderable child,
        Color background,
        Color? accent = null,
        int padLeft = 1,
        int padRight = 1,
        int padTop = 0,
        int padBottom = 0,
        int minHeight = 0)
    {
        this.child = child ?? throw new ArgumentNullException(nameof(child));
        this.background = background;
        this.accent = accent;
        this.padLeft = Math.Max(0, padLeft);
        this.padRight = Math.Max(0, padRight);
        this.padTop = Math.Max(0, padTop);
        this.padBottom = Math.Max(0, padBottom);
        this.minHeight = Math.Max(0, minHeight);
    }

    public Measurement Measure(RenderOptions options, int maxWidth) => new(maxWidth, maxWidth);

    public IEnumerable<Segment> Render(RenderOptions options, int maxWidth)
    {
        var paint = background != Color.Default;
        var backgroundStyle = paint ? new Style(background: background) : Style.Plain;
        var barStyle = accent is { } accentColor
            ? new Style(foreground: accentColor, background: paint ? background : Color.Default)
            : backgroundStyle;
        var barWidth = this.accent is null ? 0 : 1;
        var innerWidth = Math.Max(1, maxWidth - barWidth - padLeft - padRight);
        var lines = Segment.SplitLines(child.Render(options, innerWidth));
        var output = new List<List<Segment>>();
        for (var i = 0; i < padTop; i++)
        {
            output.Add(FrameLine(maxWidth, barWidth, barStyle, backgroundStyle));
        }

        foreach (var line in lines)
        {
            var row = new List<Segment>();
            if (barWidth > 0)
            {
                row.Add(new Segment(AccentGlyph, barStyle));
            }

            if (padLeft > 0)
            {
                row.Add(new Segment(new string(' ', padLeft), backgroundStyle));
            }

            var used = 0;
            foreach (var segment in line)
            {
                row.Add(new Segment(segment.Text, backgroundStyle.Combine(segment.Style)));
                used += segment.CellCount();
            }

            var fill = maxWidth - barWidth - padLeft - used;
            if (fill > 0)
            {
                row.Add(new Segment(new string(' ', fill), backgroundStyle));
            }

            output.Add(row);
        }

        for (var i = 0; i < padBottom; i++)
        {
            output.Add(FrameLine(maxWidth, barWidth, barStyle, backgroundStyle));
        }

        while (output.Count < minHeight)
        {
            output.Add(FrameLine(maxWidth, barWidth, barStyle, backgroundStyle));
        }

        return SegmentGrid.Join(output);
    }

    private static List<Segment> FrameLine(int maxWidth, int barWidth, Style barStyle, Style background)
    {
        var row = new List<Segment>();
        if (barWidth > 0)
        {
            row.Add(new Segment(AccentGlyph, barStyle));
        }

        var fill = maxWidth - barWidth;
        if (fill > 0)
        {
            row.Add(new Segment(new string(' ', fill), background));
        }

        return row;
    }
}
