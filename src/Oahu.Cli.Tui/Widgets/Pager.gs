package Oahu.Cli.Tui.Widgets

import System
import System.Collections.Generic

/// In-memory pager for a string buffer split by lines. Tracks viewport offset
/// and exposes scroll commands for use by TUI overlays (logs, help, etc.).
/// Rendering is the caller's job — this widget only manages window math.
class Pager {
    private let lines List[string] = List[string]()
    private var offset int32
    private var viewportHeight int32 = 10

    prop ViewportHeight int32 {
        get -> viewportHeight
        set -> viewportHeight = Math.Max(1, value)
    }

    prop Offset int32 -> offset
    prop LineCount int32 -> lines.Count
    prop AtTop bool -> offset <= 0
    prop AtBottom bool -> offset >= MaxOffset
    prop MaxOffset int32 -> Math.Max(0, lines.Count - viewportHeight)

    func Append(line string) {
        ArgumentNullException.ThrowIfNull(line)
        lines.Add(line)
    }

    func SetContent(newLines IEnumerable[string]) {
        ArgumentNullException.ThrowIfNull(newLines)
        lines.Clear()
        lines.AddRange(newLines)
        offset = Math.Min(offset, MaxOffset)
    }

    func Clear() {
        lines.Clear()
        offset = 0
    }

    func ScrollUp(n int32 = 1) -> offset = Math.Max(0, offset - Math.Max(1, n))

    func ScrollDown(n int32 = 1) -> offset = Math.Min(MaxOffset, offset + Math.Max(1, n))

    func PageUp() -> ScrollUp(viewportHeight)

    func PageDown() -> ScrollDown(viewportHeight)

    func Top() -> offset = 0

    func Bottom() -> offset = MaxOffset

    /// Returns the slice of lines currently within the viewport.
    func Visible() IReadOnlyList[string] {
        if lines.Count == 0 {
            return Array.Empty[string]()
        }
        let end = Math.Min(lines.Count, offset + viewportHeight)
        let slice = List[string](end - offset)
        for var i = offset;
        i < end;
        i++ {
            slice.Add(lines[i])
        }
        return slice
    }
}
