// G# port of Tui/IconsTests.cs.
//
// Covers icon glyph/ASCII-fallback rendering and the invariant that all
// prefix icons render as single-cell glyphs in both modes.

package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Icons
import Xunit

class IconsTests {
    @Fact
    func Render_With_Ascii_True_Returns_Ascii_Fallback() {
        Assert.Equal(Icons.Success.AsciiFallback, Icons.Success.Render(true))
        Assert.Equal(Icons.Working.AsciiFallback, Icons.Working.Render(true))
    }

    @Fact
    func Render_With_Ascii_False_Returns_Glyph() {
        Assert.Equal(Icons.Success.Glyph, Icons.Success.Render(false))
        Assert.Equal(Icons.Working.Glyph, Icons.Working.Render(false))
    }

    @Fact
    func Prefix_Icons_Are_Single_Cell_In_Both_Modes() {
        // Icons used in fixed-width prefixes must be single-cell in both modes.
        // (Arrows and other inline icons may be multi-char in ASCII fallback.)
        var prefixIcons = []Icon{
            Icons.Success, Icons.Error, Icons.Warning, Icons.Info, Icons.Disabled,
            Icons.Prompt, Icons.Filled, Icons.Working, Icons.Empty,
        }
        for ic in prefixIcons {
            Assert.True(ic.AsciiFallback.Length == 1, "ASCII fallback of $(ic.ScreenReaderLabel) not single-char: '$(ic.AsciiFallback)'")

            var runeCount = 0
            for r in ic.Glyph.EnumerateRunes() {
                runeCount = runeCount + 1
            }
            Assert.Equal(1, runeCount)
        }
    }

    @Fact
    func Working_Indicator_Is_Half_Filled_Disc() {
        Assert.Equal("◐", Icons.Working.Glyph)
    }
}
