using System;
using System.Collections.Generic;
using System.Linq;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public sealed class Overlay : IRenderable
{
    private readonly IRenderable _baseFrame;
    private readonly IRenderable _modal;
    private readonly int _modalWidth;

    public Overlay(IRenderable baseFrame, IRenderable modal, int modalWidth)
    {
        _baseFrame = baseFrame ?? throw new ArgumentNullException(nameof(baseFrame));
        _modal = modal ?? throw new ArgumentNullException(nameof(modal));
        _modalWidth = Math.Max(1, modalWidth);
    }

    public Measurement Measure(RenderOptions options, int maxWidth) => new(maxWidth, maxWidth);

    public IEnumerable<Segment> Render(RenderOptions options, int maxWidth)
    {
        var baseLines = Segment.SplitLines(_baseFrame.Render(options, maxWidth))
            .Select(line => new List<Segment>(line))
            .ToList();
        var width = Math.Min(_modalWidth, maxWidth);
        var modalLines = Segment.SplitLines(_modal.Render(options, width));
        var left = Math.Max(0, (maxWidth - width) / 2);
        var top = Math.Max(0, (baseLines.Count - modalLines.Count) / 2);
        for (var row = 0; row < modalLines.Count; row++)
        {
            var index = top + row;
            if (index >= 0 && index < baseLines.Count)
            {
                baseLines[index] = Compose(baseLines[index], left, modalLines[row], width, maxWidth);
            }
        }

        return SegmentGrid.Join(baseLines);
    }

    private static List<Segment> Compose(
        List<Segment> baseLine,
        int left,
        IReadOnlyList<Segment> modalLine,
        int modalWidth,
        int totalWidth)
    {
        var row = new List<Segment>();
        row.AddRange(SegmentGrid.Slice(baseLine, 0, left));
        var used = 0;
        foreach (var segment in modalLine)
        {
            row.Add(segment);
            used += segment.CellCount();
        }

        if (used < modalWidth)
        {
            row.Add(new Segment(new string(' ', modalWidth - used)));
        }

        row.AddRange(SegmentGrid.Slice(baseLine, left + modalWidth, totalWidth));
        return row;
    }
}
