// G# port of Commands/ThemeStartupTests.cs.
// All 7 tests now recovered: init-only props on GlobalOptions work in 0.1.516.

package Oahu.Cli.Tests.Experiment.Commands

import System
import Oahu.Cli.Commands
import Oahu.Cli.Tui.Themes
import Xunit

@Collection("EnvVarSerial")
type ThemeStartupTests class : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() {
        Theme.Reset()
    }

    @Fact
    func ExplicitFlag_Wins_Over_Config_And_NoColor() {
        let globals = GlobalOptions() { ThemeOverride = "Colorblind", ForceNoColor = true }
        let name = TuiCommand.ResolveStartupThemeName(globals, "HighContrast")
        Assert.Equal("Colorblind", name)
    }

    @Fact
    func ExplicitFlag_IsCaseInsensitive() {
        let globals = GlobalOptions() { ThemeOverride = "highcontrast" }
        let name = TuiCommand.ResolveStartupThemeName(globals, nil)
        Assert.Equal("HighContrast", name)
    }

    @Fact
    func NoColor_Forces_Mono_When_No_Explicit_Flag() {
        let globals = GlobalOptions() { ForceNoColor = true }
        let name = TuiCommand.ResolveStartupThemeName(globals, "HighContrast")
        Assert.Equal("Mono", name)
    }

    @Fact
    func Config_Theme_Wins_Over_Default_When_No_Flag() {
        let globals = GlobalOptions()
        let name = TuiCommand.ResolveStartupThemeName(globals, "HighContrast")
        Assert.Equal("HighContrast", name)
    }

    @Fact
    func Unknown_Configured_Theme_Falls_Back_To_Default() {
        let globals = GlobalOptions()
        let name = TuiCommand.ResolveStartupThemeName(globals, "Solarized")
        Assert.Equal("Default", name)
    }

    @Fact
    func Unknown_Explicit_Override_Falls_Through_To_Config() {
        let globals = GlobalOptions() { ThemeOverride = "Solarized" }
        let name = TuiCommand.ResolveStartupThemeName(globals, "Mono")
        Assert.Equal("Mono", name)
    }

    @Fact
    func All_Empty_Returns_Default() {
        let name = TuiCommand.ResolveStartupThemeName(GlobalOptions(), nil)
        Assert.Equal("Default", name)
    }
}
