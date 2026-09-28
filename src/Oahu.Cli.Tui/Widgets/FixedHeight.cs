using System;
using System.Collections.Generic;
using System.Linq;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public sealed class FixedHeight : IRenderable
{
    private readonly IRenderable child;
    private readonly int height;
    private readonly Style? fill;

    public FixedHeight(IRenderable child, int height, Style? fill = null)
    {
        this.child = child ?? throw new ArgumentNullException(nameof(child));
        this.height = Math.Max(1, height);
        this.fill = fill;
    }

    public Measurement Measure(RenderOptions options, int maxWidth) => new(maxWidth, maxWidth);

    public IEnumerable<Segment> Render(RenderOptions options, int maxWidth)
    {
        var lines = Segment.SplitLines(child.Render(options, maxWidth))
            .Select(line => SegmentGrid.PadLine(line, maxWidth, fill))
            .ToList();
        if (lines.Count > height)
        {
            lines = lines.Take(height).ToList();
        }
        else
        {
            while (lines.Count < height)
            {
                lines.Add(SegmentGrid.PadLine(Array.Empty<Segment>(), maxWidth, fill));
            }
        }

        return SegmentGrid.Join(lines);
    }
}
