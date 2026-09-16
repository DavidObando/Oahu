package Oahu.Cli.Tui.Widgets

import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic

/// Wraps a child renderable in a solid background block that fills the full available
/// width, in the OpenCode/Copilot-CLI style. Optionally draws a themed one-cell accent
/// bar down the left edge (used by modal surfaces) and adds interior padding rows.
/// Emits line breaks *between* lines only (no trailing break) so callers can compose
/// deterministic fixed-height layouts.
///
/// When [`background`](paramref) is (cref:Color.Default) no fill segments are emitted at
/// all (Mono / NO_COLOR / screen-reader themes must never paint backgrounds); the child
/// renders through with plain padding.
class Backdrop : IRenderable {
    private let child IRenderable
    private let background Color
    private let accent Color?
    private let padLeft int32
    private let padRight int32
    private let padTop int32
    private let padBottom int32
    private let minHeight int32

    init(
        child IRenderable,
        background Color,
        accent Color? = nil,
        padLeft int32 = 1,
        padRight int32 = 1,
        padTop int32 = 0,
        padBottom int32 = 0,
        minHeight int32 = 0
    ) {
        this.child = child ?? throw ArgumentNullException("child")
        this.background = background
        this.accent = accent
        this.padLeft = Math.Max(0, padLeft)
        this.padRight = Math.Max(0, padRight)
        this.padTop = Math.Max(0, padTop)
        this.padBottom = Math.Max(0, padBottom)
        this.minHeight = Math.Max(0, minHeight)
    }

    func Measure(options RenderOptions, maxWidth int32) Measurement -> Measurement(maxWidth, maxWidth)

    func Render(options RenderOptions, maxWidth int32) IEnumerable[Segment] {
        // Mono guard: a Default background means "never paint" — pad with plain spaces.
        let paint = background != Color.Default
        let bg = if paint {
            Style(background: background)
        } else {
            Style.Plain
        }
        let barStyle = if accent is {} a {
            Style(
                foreground: a,
                background: if paint {
                    background
                } else {
                    Color.Default
                }
            )
        } else {
            bg
        }
        let barWidth = if accent == nil {
            0
        } else {
            1
        }
        let innerWidth = Math.Max(1, maxWidth - barWidth - padLeft - padRight)
        let lines = Segment.SplitLines(child.Render(options, innerWidth))
        let outLines = List[List[Segment]]()
        for var i = 0; i < padTop; i++ {
            outLines.Add(FrameLine(maxWidth, barWidth, barStyle, bg))
        }
        for line in lines {
            let row = List[Segment]()
            if barWidth > 0 {
                row.Add(Segment(AccentGlyph, barStyle))
            }
            if padLeft > 0 {
                row.Add(Segment(String(' ', padLeft), bg))
            }
            var used = 0
            for seg in line {
                // bg fills in only where the segment has no explicit style of its own
                // (e.g. plain markup text); an already-backgrounded child segment (a
                // nested Backdrop) keeps its own color.
                row.Add(Segment(seg.Text, bg.Combine(seg.Style)))
                used += seg.CellCount()
            }
            let fill = maxWidth - barWidth - padLeft - used
            if fill > 0 {
                row.Add(Segment(String(' ', fill), bg))
            }
            outLines.Add(row)
        }
        for var i = 0; i < padBottom; i++ {
            outLines.Add(FrameLine(maxWidth, barWidth, barStyle, bg))
        }
        while outLines.Count < minHeight {
            outLines.Add(FrameLine(maxWidth, barWidth, barStyle, bg))
        }
        return SegmentGrid.Join(outLines)
    }

    shared {
        private const AccentGlyph string = "▏"

        private func FrameLine(maxWidth int32, barWidth int32, barStyle Style, bg Style) List[Segment] {
            let row = List[Segment]()
            if barWidth > 0 {
                row.Add(Segment(AccentGlyph, barStyle))
            }
            let fill = maxWidth - barWidth
            if fill > 0 {
                row.Add(Segment(String(' ', fill), bg))
            }
            return row
        }
    }
}
