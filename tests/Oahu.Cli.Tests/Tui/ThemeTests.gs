package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Themes
import Spectre.Console
import System
import Xunit

class ThemeTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() -> Theme.Reset()

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
        Assert.Equal(name, Theme.Current.Name, ignoreCase: true)
    }

    @Fact
    func Use_Throws_For_Unknown_Theme() {
        let ex = Assert.Throws[ArgumentException](() -> Theme.Use("does-not-exist"))
        Assert.Contains("does-not-exist", ex.Message)
    }

    @Fact
    func Mono_Theme_Has_No_Coloured_Tokens() {
        // Every token in Mono must equal Spectre's Color.Default to guarantee no ANSI is emitted.
        let t = Themes.Mono
        Assert.Equal(Color.Default, t.TextPrimary.Value)
        Assert.Equal(Color.Default, t.StatusError.Value)
        Assert.Equal(Color.Default, t.Brand.Value)
        Assert.Equal(Color.Default, t.Selected.Value)
    }

    @Fact
    func Available_Includes_All_Three_Builtins() {
        Assert.Contains(Theme.Available, (t Theme) -> t.Name == "Default")
        Assert.Contains(Theme.Available, (t Theme) -> t.Name == "Mono")
        Assert.Contains(Theme.Available, (t Theme) -> t.Name == "HighContrast")
    }
}
