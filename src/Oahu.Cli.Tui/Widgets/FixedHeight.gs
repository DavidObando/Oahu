package Oahu.Cli.Tui.Widgets

import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Linq

/// Forces a child renderable to occupy exactly a fixed number of lines: it is truncated
/// (keeping the top) when too tall, and padded with blank lines when too short. Emits line
/// breaks only *between* lines (no trailing break) so it composes into deterministic
/// fixed-height layouts.
class FixedHeight : IRenderable {
    private let child IRenderable
    private let height int32
    private let fill Style?

    init(child IRenderable, height int32, fill Style? = nil) {
        this.child = child ?? throw ArgumentNullException("child")
        this.height = Math.Max(1, height)
        this.fill = fill
    }

    func Measure(options RenderOptions, maxWidth int32) Measurement -> Measurement(maxWidth, maxWidth)

    func Render(options RenderOptions, maxWidth int32) IEnumerable[Segment] {
        var lines = Segment
            .SplitLines(child.Render(options, maxWidth))
            .Select((l SegmentLine) -> SegmentGrid.PadLine(l, maxWidth, fill))
            .ToList()
        if lines.Count > height {
            lines = lines.Take(height).ToList()
        } else {
            while lines.Count < height {
                lines.Add(SegmentGrid.PadLine(List[Segment](), maxWidth, fill))
            }
        }
        return SegmentGrid.Join(lines)
    }
}
