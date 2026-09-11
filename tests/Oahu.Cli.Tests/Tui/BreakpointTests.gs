package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Hooks
import Xunit

class BreakpointTests {
    @Theory
    @InlineData(40, 0)
    @InlineData(79, 0)
    @InlineData(80, 1)
    @InlineData(119, 1)
    @InlineData(120, 2)
    @InlineData(220, 2)
    func For_Width_Maps_To_Expected_Kind(width int32, expected BreakpointKind) {
        Assert.Equal(expected, Breakpoint.For(width))
    }
}
