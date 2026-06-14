// G# port of Tui/Widgets/PagerTests.cs.
//
// Tests in-memory Pager scroll math: viewport, offset clamping, page up/down,
// top/bottom jumps, SetContent, and empty-pager edge case.
//
// LIMITATIONS:
// - Assert.Equal on IReadOnlyList<string> vs string[]: use indexed assertions.
// - .Count on IReadOnlyList doesn't bind: use Linq .Count() extension.
// - SetContent with IEnumerable<string>: pass List[string] which implements it.

package Oahu.Cli.Tests.Tui.Widgets

import System.Collections.Generic
import System.Linq
import Oahu.Cli.Tui.Widgets
import Xunit

class PagerTests {
    func makePager(viewport int32, lineCount int32) Pager {
        var p = Pager()
        p.ViewportHeight = viewport
        var i = 0
        for i < lineCount {
            p.Append("line-$i")
            i = i + 1
        }
        return p
    }

    @Fact
    func Initial_Visible_Is_First_Window() {
        var p = makePager(3, 10)
        var v = p.Visible()
        Assert.Equal(3, v.Count())
        Assert.Equal("line-0", v[0])
        Assert.Equal("line-1", v[1])
        Assert.Equal("line-2", v[2])
        Assert.True(p.AtTop)
        Assert.False(p.AtBottom)
    }

    @Fact
    func ScrollDown_Advances_Offset_And_Clamps_At_Bottom() {
        var p = makePager(3, 10)
        p.ScrollDown(5)
        Assert.Equal(5, p.Offset)
        p.ScrollDown(100)
        Assert.True(p.AtBottom)
        Assert.Equal(p.MaxOffset, p.Offset)
    }

    @Fact
    func ScrollUp_Clamps_At_Top() {
        var p = makePager(3, 10)
        p.ScrollDown(2)
        p.ScrollUp(50)
        Assert.True(p.AtTop)
    }

    @Fact
    func PageUp_PageDown_Move_By_Viewport() {
        var p = makePager(3, 10)
        p.PageDown()
        Assert.Equal(3, p.Offset)
        p.PageUp()
        Assert.Equal(0, p.Offset)
    }

    @Fact
    func Top_And_Bottom_Jump() {
        var p = makePager(3, 10)
        p.Bottom()
        Assert.Equal(p.MaxOffset, p.Offset)
        p.Top()
        Assert.Equal(0, p.Offset)
    }

    @Fact
    func SetContent_Preserves_Offset_When_Possible() {
        var p = makePager(3, 10)
        p.ScrollDown(5)
        var newLines = List[string]()
        var i = 0
        for i < 8 {
            newLines.Add("x-$i")
            i = i + 1
        }
        p.SetContent(newLines)
        Assert.True(p.Offset <= p.MaxOffset)
    }

    @Fact
    func Empty_Pager_Has_No_Visible_Lines() {
        var p = Pager()
        p.ViewportHeight = 5
        var v = p.Visible()
        Assert.Equal(0, v.Count())
        Assert.True(p.AtTop)
        Assert.True(p.AtBottom)
    }
}
