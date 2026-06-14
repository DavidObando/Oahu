// G# port of Tui/BreakpointTests.cs.
//
// Pure @Theory + @InlineData coverage of Breakpoint.For: confirms each width
// maps to the expected BreakpointKind.

package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Hooks
import Xunit

class BreakpointTests {
    @Theory
    @InlineData(40, BreakpointKind.Compact)
    @InlineData(79, BreakpointKind.Compact)
    @InlineData(80, BreakpointKind.Narrow)
    @InlineData(119, BreakpointKind.Narrow)
    @InlineData(120, BreakpointKind.Wide)
    @InlineData(220, BreakpointKind.Wide)
    func For_Width_Maps_To_Expected_Kind(width int32, expected BreakpointKind) {
        Assert.Equal(expected, Breakpoint.For(width))
    }
}
