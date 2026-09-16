package Oahu.Cli.Tests.Tui.Widgets

import Oahu.Cli.Tui.Widgets
import System.Linq
import Xunit

class PagerTests {
    @Fact
    func Initial_Visible_Is_First_Window() {
        let p = NewPager(3, 10)
        let v = p.Visible()
        Assert.Equal([]string{"line-0", "line-1", "line-2"}, v)
        Assert.True(p.AtTop)
        Assert.False(p.AtBottom)
    }

    @Fact
    func ScrollDown_Advances_Offset_And_Clamps_At_Bottom() {
        let p = NewPager(3, 10)
        p.ScrollDown(5)
        Assert.Equal(5, p.Offset)
        p.ScrollDown(100)
        Assert.True(p.AtBottom)
        Assert.Equal(p.MaxOffset, p.Offset)
    }

    @Fact
    func ScrollUp_Clamps_At_Top() {
        let p = NewPager(3, 10)
        p.ScrollDown(2)
        p.ScrollUp(50)
        Assert.True(p.AtTop)
    }

    @Fact
    func PageUp_PageDown_Move_By_Viewport() {
        let p = NewPager(3, 10)
        p.PageDown()
        Assert.Equal(3, p.Offset)
        p.PageUp()
        Assert.Equal(0, p.Offset)
    }

    @Fact
    func Top_And_Bottom_Jump() {
        let p = NewPager(3, 10)
        p.Bottom()
        Assert.Equal(p.MaxOffset, p.Offset)
        p.Top()
        Assert.Equal(0, p.Offset)
    }

    @Fact
    func SetContent_Preserves_Offset_When_Possible() {
        let p = NewPager(3, 10)
        p.ScrollDown(5)
        p.SetContent(Enumerable.Range(0, 8).Select((i int32) -> "x-$i"))
        Assert.True(p.Offset <= p.MaxOffset)
    }

    @Fact
    func Empty_Pager_Has_No_Visible_Lines() {
        let p = Pager{ViewportHeight: 5}
        Assert.Empty(p.Visible())
        Assert.True(p.AtTop)
        Assert.True(p.AtBottom)
    }

    shared {
        private func NewPager(viewport int32 = 3, lineCount int32 = 10) Pager {
            let p = Pager{ViewportHeight: viewport}
            for var i = 0; i < lineCount; i++ {
                p.Append("line-$i")
            }
            return p
        }
    }
}
