using System;
using System.Collections.Generic;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public sealed class SideBySide : IRenderable
{
    private readonly IRenderable _left;
    private readonly IRenderable _right;
    private readonly int _leftWidth;
    private readonly int _gap;
    private readonly int _rightWidth;
    private readonly Style? _fill;

    public SideBySide(
        IRenderable left,
        int leftWidth,
        int gap,
        IRenderable right,
        int rightWidth,
        Style? fill = null)
    {
        _left = left ?? throw new ArgumentNullException(nameof(left));
        _right = right ?? throw new ArgumentNullException(nameof(right));
        _leftWidth = Math.Max(1, leftWidth);
        _gap = Math.Max(0, gap);
        _rightWidth = Math.Max(1, rightWidth);
        _fill = fill;
    }

    public Measurement Measure(RenderOptions options, int maxWidth) => new(maxWidth, maxWidth);

    public IEnumerable<Segment> Render(RenderOptions options, int maxWidth)
    {
        var leftLines = Segment.SplitLines(_left.Render(options, _leftWidth));
        var rightLines = Segment.SplitLines(_right.Render(options, _rightWidth));
        var rows = Math.Max(leftLines.Count, rightLines.Count);
        var output = new List<List<Segment>>(rows);
        for (var i = 0; i < rows; i++)
        {
            var row = new List<Segment>();
            IReadOnlyList<Segment> leftLine = i < leftLines.Count ? leftLines[i] : Array.Empty<Segment>();
            row.AddRange(SegmentGrid.PadLine(leftLine, _leftWidth, _fill));
            if (_gap > 0)
            {
                row.Add(new Segment(new string(' ', _gap), _fill ?? Style.Plain));
            }

            IReadOnlyList<Segment> rightLine = i < rightLines.Count ? rightLines[i] : Array.Empty<Segment>();
            row.AddRange(SegmentGrid.PadLine(rightLine, _rightWidth, _fill));
            output.Add(row);
        }

        return SegmentGrid.Join(output);
    }
}
