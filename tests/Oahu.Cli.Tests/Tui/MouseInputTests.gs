package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Widgets
import System
import System.Collections.Generic
import Xunit

class MouseInputTests {
    /// Builds a readNext delegate over a fixed string, as the console reader
    /// would deliver the characters after `ESC [ <`.
    private func Feed(chars string)() -> char? {
        var i = 0
        return () -> {
            if i >= chars.Length {
                return nil
            }
            let c = chars[i]
            i++
            return c
        }
    }

    @Fact
    func Parses_Wheel_Up() {
        let read = Feed("64;10;5M")
        Assert.True(SgrMouseParser.TryParse(read, out var ev))
        Assert.NotNull(ev)
        Assert.Equal(MouseEventKind.WheelUp, ev!!.Kind)
        Assert.Equal(9, ev!!.X)
        Assert.Equal(4, ev!!.Y)
    }

    @Fact
    func Parses_Wheel_Down() {
        Assert.True(SgrMouseParser.TryParse(Feed("65;1;1M"), out var ev))
        Assert.Equal(MouseEventKind.WheelDown, ev!!.Kind)
        Assert.Equal(0, ev!!.X)
        Assert.Equal(0, ev!!.Y)
    }

    @Fact
    func Parses_Left_Click_Press() {
        Assert.True(SgrMouseParser.TryParse(Feed("0;3;2M"), out var ev))
        Assert.Equal(MouseEventKind.Click, ev!!.Kind)
        Assert.Equal(2, ev!!.X)
        Assert.Equal(1, ev!!.Y)
    }

    @Fact
    func Release_Is_Consumed_Without_Event() {
        Assert.True(SgrMouseParser.TryParse(Feed("0;3;2m"), out var ev))
        Assert.Null(ev)
    }

    @Fact
    func Drag_Is_Consumed_Without_Event() {
        Assert.True(SgrMouseParser.TryParse(Feed("32;3;2M"), out var ev))
        Assert.Null(ev)
    }

    @Fact
    func Right_Button_Is_Consumed_Without_Event() {
        Assert.True(SgrMouseParser.TryParse(Feed("2;3;2M"), out var ev))
        Assert.Null(ev)
    }

    @Fact
    func Truncated_Sequence_Fails() {
        Assert.False(SgrMouseParser.TryParse(Feed("0;3"), out var ev))
        Assert.Null(ev)
    }

    @Fact
    func Garbage_Fails() {
        Assert.False(SgrMouseParser.TryParse(Feed("x"), out var ev))
        Assert.Null(ev)
    }

    @Fact
    func TabStrip_HitTest_Maps_Columns_To_Tabs() {
        let strip = TabStrip{Titles: []string{"Home", "Library", "Queue"}, ActiveIndex: 0}
        // Entry 0: " 1 home " → columns 0..7 (width 8).
        Assert.Equal(0, strip.HitTest(0))
        Assert.Equal(0, strip.HitTest(7))
        // Separator space at column 8 belongs to no tab... entry 1 starts at 9.
        Assert.Equal(1, strip.HitTest(9))
        Assert.Equal(1, strip.HitTest(19))
        Assert.Equal(2, strip.HitTest(21))
        Assert.Equal(-1, strip.HitTest(-1))
        Assert.Equal(-1, strip.HitTest(500))
    }
}
