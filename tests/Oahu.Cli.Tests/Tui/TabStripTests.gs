package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Themes
import Oahu.Cli.Tui.Widgets
import Spectre.Console.Testing
import System
import Xunit

@Collection("EnvVarSerial")
class TabStripTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() -> Theme.Reset()

    @Fact
    func Renders_All_Titles_With_Number_Prefixes() {
        let c = TestConsole()
        c.Profile.Width = 120
        c.EmitAnsiSequences = false
        TabStrip{Titles: []string{"Home", "Library", "Queue"}, ActiveIndex: 0}.Write(c)
        let output = c.Output
        // Titles render lowercase in the streamlined strip.
        Assert.Contains("1 home", output)
        Assert.Contains("2 library", output)
        Assert.Contains("3 queue", output)
    }

    @Fact
    func Active_Index_Out_Of_Range_Renders_Without_Highlight() {
        // Defensive: the strip should not crash if ActiveIndex is out of range.
        let c = TestConsole()
        c.Profile.Width = 80
        c.EmitAnsiSequences = false
        let ex = Record.Exception(() -> TabStrip{Titles: []string{"A", "B"}, ActiveIndex: 99}.Write(c))
        Assert.Null(ex)
    }
}
