// G# port of Tui/TabStripTests.cs.
//
// Tests TabStrip rendering: numbered titles and defensive out-of-range index.
//
// WORKAROUNDS:
// - Theme.Reset() called explicitly at start of each test (no IDisposable on test class).

package Oahu.Cli.Tests.Experiment.Tui

import Oahu.Cli.Tui.Themes
import Oahu.Cli.Tui.Widgets
import Spectre.Console.Testing
import Xunit

type TabStripTests class {
    @Fact
    func Renders_All_Titles_With_Number_Prefixes() {
        Theme.Reset()
        defer Theme.Reset()

        var c = TestConsole()
        var p1 = c.Profile
        p1.Width = 120
        c.EmitAnsiSequences = false
        TabStrip() {
            Titles = []string{"Home", "Library", "Queue"},
            ActiveIndex = 0
        }.Write(c)
        let output = c.Output
        Assert.Contains("1 Home", output)
        Assert.Contains("2 Library", output)
        Assert.Contains("3 Queue", output)
    }

    @Fact
    func Active_Index_Out_Of_Range_Renders_Without_Highlight() {
        Theme.Reset()
        defer Theme.Reset()

        var c = TestConsole()
        var p2 = c.Profile
        p2.Width = 80
        c.EmitAnsiSequences = false
        let ex = Record.Exception(func() {
            TabStrip() {
                Titles = []string{"A", "B"},
                ActiveIndex = 99
            }.Write(c)
        })
        Assert.Null(ex)
    }
}
