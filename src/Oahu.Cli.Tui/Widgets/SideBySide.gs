package Oahu.Cli.Tui.Widgets

import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic

/// Composites two renderables into fixed-width columns separated by a gap, at the segment
/// level. Unlike a Spectre `Grid`, it emits line breaks only *between* lines (no trailing
/// break), so it can be nested inside deterministic fixed-height layouts.
class SideBySide : IRenderable {
    private let left IRenderable
    private let right IRenderable
    private let leftWidth int32
    private let gap int32
    private let rightWidth int32
    private let fill Style?

    init(left IRenderable, leftWidth int32, gap int32, right IRenderable, rightWidth int32, fill Style? = nil) {
        this.left = left ?? throw ArgumentNullException("left")
        this.right = right ?? throw ArgumentNullException("right")
        this.leftWidth = Math.Max(1, leftWidth)
        this.gap = Math.Max(0, gap)
        this.rightWidth = Math.Max(1, rightWidth)
        this.fill = fill
    }

    func Measure(options RenderOptions, maxWidth int32) Measurement -> Measurement(maxWidth, maxWidth)

    func Render(options RenderOptions, maxWidth int32) IEnumerable[Segment] {
        let leftLines = Segment.SplitLines(left.Render(options, leftWidth))
        let rightLines = Segment.SplitLines(right.Render(options, rightWidth))
        let rows = Math.Max(leftLines.Count, rightLines.Count)
        let outLines = List[List[Segment]](rows)
        for var i = 0; i < rows; i++ {
            let row = List[Segment]()
            let leftLine = if i < leftLines.Count {
                cast[IReadOnlyList[Segment]](leftLines[i])
            } else {
                cast[IReadOnlyList[Segment]](List[Segment]())
            }
            row.AddRange(SegmentGrid.PadLine(leftLine, leftWidth, fill))
            if gap > 0 {
                row.Add(Segment(String(' ', gap), fill ?? Style.Plain))
            }
            let rightLine = if i < rightLines.Count {
                cast[IReadOnlyList[Segment]](rightLines[i])
            } else {
                cast[IReadOnlyList[Segment]](List[Segment]())
            }
            row.AddRange(SegmentGrid.PadLine(rightLine, rightWidth, fill))
            outLines.Add(row)
        }
        return SegmentGrid.Join(outLines)
    }
}
