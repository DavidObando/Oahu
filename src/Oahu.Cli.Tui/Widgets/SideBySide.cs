using System;
using System.Collections.Generic;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public sealed class SideBySide : IRenderable
{
    private readonly IRenderable left;
    private readonly IRenderable right;
    private readonly int leftWidth;
    private readonly int gap;
    private readonly int rightWidth;
    private readonly Style? fill;

    public SideBySide(
        IRenderable left,
        int leftWidth,
        int gap,
        IRenderable right,
        int rightWidth,
        Style? fill = null)
    {
        this.left = left ?? throw new ArgumentNullException(nameof(left));
        this.right = right ?? throw new ArgumentNullException(nameof(right));
        this.leftWidth = Math.Max(1, leftWidth);
        this.gap = Math.Max(0, gap);
        this.rightWidth = Math.Max(1, rightWidth);
        this.fill = fill;
    }

    public Measurement Measure(RenderOptions options, int maxWidth) => new(maxWidth, maxWidth);

    public IEnumerable<Segment> Render(RenderOptions options, int maxWidth)
    {
        var leftLines = Segment.SplitLines(left.Render(options, leftWidth));
        var rightLines = Segment.SplitLines(right.Render(options, rightWidth));
        var rows = Math.Max(leftLines.Count, rightLines.Count);
        var output = new List<List<Segment>>(rows);
        for (var i = 0; i < rows; i++)
        {
            var row = new List<Segment>();
            IReadOnlyList<Segment> leftLine = i < leftLines.Count ? leftLines[i] : Array.Empty<Segment>();
            row.AddRange(SegmentGrid.PadLine(leftLine, leftWidth, fill));
            if (gap > 0)
            {
                row.Add(new Segment(new string(' ', gap), fill ?? Style.Plain));
            }

            IReadOnlyList<Segment> rightLine = i < rightLines.Count ? rightLines[i] : Array.Empty<Segment>();
            row.AddRange(SegmentGrid.PadLine(rightLine, rightWidth, fill));
            output.Add(row);
        }

        return SegmentGrid.Join(output);
    }
}
