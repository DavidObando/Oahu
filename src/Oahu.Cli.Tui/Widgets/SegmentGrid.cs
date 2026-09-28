using System;
using System.Collections.Generic;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

internal static class SegmentGrid
{
    public static IEnumerable<Segment> Join(IReadOnlyList<List<Segment>> lines)
    {
        for (var i = 0; i < lines.Count; i++)
        {
            if (i > 0)
            {
                yield return Segment.LineBreak;
            }

            foreach (var segment in lines[i])
            {
                yield return segment;
            }
        }
    }

    public static List<Segment> PadLine(IReadOnlyList<Segment> line, int width, Style? fill = null)
    {
        var row = new List<Segment>(line.Count + 1);
        var used = 0;
        foreach (var segment in line)
        {
            row.Add(segment);
            used += segment.CellCount();
        }

        if (used < width)
        {
            row.Add(new Segment(new string(' ', width - used), fill ?? Style.Plain));
        }

        return row;
    }

    public static List<Segment> Slice(IReadOnlyList<Segment> line, int start, int end)
    {
        var result = new List<Segment>();
        if (end <= start)
        {
            return result;
        }

        var column = 0;
        foreach (var segment in line)
        {
            if (column >= end)
            {
                break;
            }

            var segmentStart = column;
            var segmentEnd = column + segment.Text.Length;
            var sliceStart = Math.Max(start, segmentStart);
            var sliceEnd = Math.Min(end, segmentEnd);
            if (sliceEnd > sliceStart)
            {
                result.Add(new Segment(
                    segment.Text.Substring(sliceStart - segmentStart, sliceEnd - sliceStart),
                    segment.Style));
            }

            column = segmentEnd;
        }

        var produced = Math.Max(0, Math.Min(end, column) - start);
        var needed = end - start - produced;
        if (needed > 0)
        {
            result.Add(new Segment(new string(' ', needed)));
        }

        return result;
    }
}
