using System;
using System.Collections.Generic;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public sealed class Backdrop : IRenderable
{
    private const string AccentGlyph = "▏";
    private readonly IRenderable _child;
    private readonly Color _background;
    private readonly Color? _accent;
    private readonly int _padLeft;
    private readonly int _padRight;
    private readonly int _padTop;
    private readonly int _padBottom;
    private readonly int _minHeight;

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
        _child = child ?? throw new ArgumentNullException(nameof(child));
        _background = background;
        _accent = accent;
        _padLeft = Math.Max(0, padLeft);
        _padRight = Math.Max(0, padRight);
        _padTop = Math.Max(0, padTop);
        _padBottom = Math.Max(0, padBottom);
        _minHeight = Math.Max(0, minHeight);
    }

    public Measurement Measure(RenderOptions options, int maxWidth) => new(maxWidth, maxWidth);

    public IEnumerable<Segment> Render(RenderOptions options, int maxWidth)
    {
        var paint = _background != Color.Default;
        var backgroundStyle = paint ? new Style(background: _background) : Style.Plain;
        var barStyle = _accent is { } accent
            ? new Style(foreground: accent, background: paint ? _background : Color.Default)
            : backgroundStyle;
        var barWidth = _accent is null ? 0 : 1;
        var innerWidth = Math.Max(1, maxWidth - barWidth - _padLeft - _padRight);
        var lines = Segment.SplitLines(_child.Render(options, innerWidth));
        var output = new List<List<Segment>>();
        for (var i = 0; i < _padTop; i++)
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

            if (_padLeft > 0)
            {
                row.Add(new Segment(new string(' ', _padLeft), backgroundStyle));
            }

            var used = 0;
            foreach (var segment in line)
            {
                row.Add(new Segment(segment.Text, backgroundStyle.Combine(segment.Style)));
                used += segment.CellCount();
            }

            var fill = maxWidth - barWidth - _padLeft - used;
            if (fill > 0)
            {
                row.Add(new Segment(new string(' ', fill), backgroundStyle));
            }

            output.Add(row);
        }

        for (var i = 0; i < _padBottom; i++)
        {
            output.Add(FrameLine(maxWidth, barWidth, barStyle, backgroundStyle));
        }

        while (output.Count < _minHeight)
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
