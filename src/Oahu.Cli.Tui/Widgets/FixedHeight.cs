using System;
using System.Collections.Generic;
using System.Linq;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public sealed class FixedHeight : IRenderable
{
    private readonly IRenderable _child;
    private readonly int _height;
    private readonly Style? _fill;

    public FixedHeight(IRenderable child, int height, Style? fill = null)
    {
        _child = child ?? throw new ArgumentNullException(nameof(child));
        _height = Math.Max(1, height);
        _fill = fill;
    }

    public Measurement Measure(RenderOptions options, int maxWidth) => new(maxWidth, maxWidth);

    public IEnumerable<Segment> Render(RenderOptions options, int maxWidth)
    {
        var lines = Segment.SplitLines(_child.Render(options, maxWidth))
            .Select(line => SegmentGrid.PadLine(line, maxWidth, _fill))
            .ToList();
        if (lines.Count > _height)
        {
            lines = lines.Take(_height).ToList();
        }
        else
        {
            while (lines.Count < _height)
            {
                lines.Add(SegmentGrid.PadLine(Array.Empty<Segment>(), maxWidth, _fill));
            }
        }

        return SegmentGrid.Join(lines);
    }
}
