// G# port of Tui/ThemeTests.cs.
//
// Tests Theme.Reset, Theme.Use, theme palette invariants, and Available list.
//
// LIMITATIONS:
// - IDisposable (IDisposable interface impl on test class) not possible (GS0157).
//   Reset is called explicitly in each test instead.
// - `for t in Theme.Available` causes MSB4181 (iteration over IReadOnlyList<Theme>
//   from CLR). Workaround: use indexed access or Linq .Count() extension.
// - Assert.Equal with ignoreCase named param: use ToLowerInvariant() comparison instead.
// - SemanticColor.Value returns a Color struct; equality works directly.

package Oahu.Cli.Tests.Experiment.Tui

import System
import System.Linq
import Oahu.Cli.Tui.Themes
import Spectre.Console
import Xunit

type ThemeTests class {
    @Fact
    func Default_Is_Active_On_Reset() {
        Theme.Reset()
        Assert.Equal("Default", Theme.Current.Name)
    }

    @Theory
    @InlineData("Default")
    @InlineData("Mono")
    @InlineData("HighContrast")
    @InlineData("highcontrast")
    @InlineData("Colorblind")
    @InlineData("colorblind")
    func Use_Switches_To_Named_Theme(name string) {
        Theme.Use(name)
        // Case-insensitive comparison since Theme.Use is case-insensitive
        Assert.Equal(name.ToLowerInvariant(), Theme.Current.Name.ToLowerInvariant())
        Theme.Reset()
    }

    @Fact
    func Use_Throws_For_Unknown_Theme() {
        var ex = Assert.Throws[ArgumentException](func() {
            Theme.Use("does-not-exist")
        })
        Assert.Contains("does-not-exist", ex.Message)
        Theme.Reset()
    }

    @Fact
    func Mono_Theme_Has_No_Coloured_Tokens() {
        var t = Themes.Mono
        Assert.Equal(Color.Default, t.TextPrimary.Value)
        Assert.Equal(Color.Default, t.StatusError.Value)
        Assert.Equal(Color.Default, t.Brand.Value)
        Assert.Equal(Color.Default, t.Selected.Value)
    }

    @Fact
    func Available_Includes_All_Three_Builtins() {
        // for-in on IReadOnlyList<Theme> causes MSB4181; verify via Use() which searches Available.
        var list = Theme.Available
        var count = list.Count()
        Assert.True(count >= 3)
        // Verify each builtin is reachable
        Theme.Use("Default")
        Assert.Equal("Default", Theme.Current.Name)
        Theme.Use("Mono")
        Assert.Equal("Mono", Theme.Current.Name)
        Theme.Use("HighContrast")
        Assert.Equal("HighContrast", Theme.Current.Name)
        Theme.Reset()
    }
}
