// G# port of Tui/WidgetSnapshotTests.cs.
//
// Tests snapshot rendering of StatusLine, HintBar, TimelineItem, SelectList,
// Dialog, StyledTable, Mono theme, and ASCII-mode glyphs.
//
// WORKAROUNDS:
// - Theme.Reset() called explicitly at start/end of each test.
// - NewConsole/RenderItem are instance methods (no static keyword in G#).
// - HashSet[int32] for IReadOnlySet[int32].
// - Spectre.Console.Markup fully qualified to avoid ambiguity.

package Oahu.Cli.Tests.Experiment.Tui

import System
import System.Collections.Generic
import Oahu.Cli.Tui.Themes
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Testing
import Xunit

type WidgetSnapshotTests class {
    func NewConsole(width int32) TestConsole {
        var c = TestConsole()
        var p = c.Profile
        p.Width = width
        c.EmitAnsiSequences = false
        return c
    }

    func RenderItem(item TimelineItem) string {
        var c = NewConsole(120)
        item.Write(c)
        return c.Output
    }

    @Fact
    func StatusLine_Includes_Verb_Hint_And_Metric() {
        Theme.Reset()
        defer Theme.Reset()

        var c = NewConsole(120)
        StatusLine() { Verb = "Decrypting", Hint = "Esc to cancel", Metric = "42 MB" }.Write(c)
        let output = c.Output
        Assert.Contains("Decrypting", output)
        Assert.Contains("Esc to cancel", output)
        Assert.Contains("42 MB", output)
    }

    @Fact
    func HintBar_Filters_Empty_Actions() {
        Theme.Reset()
        defer Theme.Reset()

        var c = NewConsole(120)
        HintBar()
            .Add("Tab", "next")
            .Add("Enter", nil)
            .Add("Esc", String.Empty)
            .Add("?", "help")
            .Write(c)
        let output = c.Output
        Assert.Contains("Tab", output)
        Assert.Contains("next", output)
        Assert.Contains("?", output)
        Assert.Contains("help", output)
        Assert.DoesNotContain("Enter", output)
    }

    @Fact
    func HintBar_Empty_Is_NoOp() {
        Theme.Reset()
        defer Theme.Reset()

        var c = NewConsole(120)
        HintBar().Write(c)
        Assert.Equal("\n", c.Output)
    }

    @Fact
    func TimelineItem_Prefix_Width_Constant_Across_States() {
        Theme.Reset()
        defer Theme.Reset()

        let loading = RenderItem(TimelineItem() { Title = "Doing", State = TimelineState.Loading })
        let success = RenderItem(TimelineItem() { Title = "Doing", State = TimelineState.Success })
        let error = RenderItem(TimelineItem() { Title = "Doing", State = TimelineState.Error })

        let loadingTitle = loading.IndexOf("Doing", StringComparison.Ordinal)
        let successTitle = success.IndexOf("Doing", StringComparison.Ordinal)
        let errorTitle = error.IndexOf("Doing", StringComparison.Ordinal)

        Assert.True(loadingTitle > 0)
        Assert.Equal(loadingTitle, successTitle)
        Assert.Equal(loadingTitle, errorTitle)
    }

    @Fact
    func TimelineItem_Renders_Detail_Indented() {
        Theme.Reset()
        defer Theme.Reset()

        var c = NewConsole(120)
        TimelineItem() {
            Title = "Library cache",
            Description = "287 books",
            State = TimelineState.Info,
            Detail = "→ run 'library sync'"
        }.Write(c)
        Assert.Contains("Library cache", c.Output)
        Assert.Contains("287 books", c.Output)
        Assert.Contains("library sync", c.Output)
    }

    @Fact
    func SelectList_Marks_Cursor_And_Selection() {
        Theme.Reset()
        defer Theme.Reset()

        var c = NewConsole(120)
        let items IReadOnlyList[string] = []string{"alpha", "beta", "gamma"}
        var selectedSet = HashSet[int32]()
        selectedSet.Add(0)
        let indices IReadOnlySet[int32] = selectedSet
        SelectList[string]() {
            Items = items,
            Format = func(s string) string { return s },
            CursorIndex = 1,
            SelectedIndices = indices
        }.Write(c)
        let output = c.Output
        Assert.Contains("alpha", output)
        Assert.Contains("beta", output)
        Assert.Contains("gamma", output)
        Assert.Contains("❯", output)
        Assert.Contains("●", output)
    }

    @Fact
    func Dialog_Wraps_Body_And_Footer() {
        Theme.Reset()
        defer Theme.Reset()

        var c = NewConsole(120)
        Dialog() {
            Title = "Heads up",
            Body = Markup("Body text"),
            Footer = HintBar().Add("Esc", "dismiss")
        }.Write(c)
        let output = c.Output
        Assert.Contains("Heads up", output)
        Assert.Contains("Body text", output)
        Assert.Contains("Esc", output)
        Assert.Contains("dismiss", output)
    }

    @Fact
    func StyledTable_Adds_Bold_Headers_And_Rows() {
        Theme.Reset()
        defer Theme.Reset()

        var c = NewConsole(120)
        var t = StyledTable.Create()
            .AddBoldColumn("Title")
            .AddBoldColumn("Author")
        t.AddRow("Project Hail Mary", "Andy Weir")
        c.Write(t)
        let output = c.Output
        Assert.Contains("Title", output)
        Assert.Contains("Author", output)
        Assert.Contains("Andy Weir", output)
    }

    @Fact
    func Mono_Theme_Renders_Without_Ansi_Escapes() {
        Theme.Reset()
        defer Theme.Reset()

        Theme.Use("Mono")
        var c = NewConsole(120)
        c.EmitAnsiSequences = true
        StatusLine() { Verb = "Working" }.Write(c)
        TimelineItem() { Title = "Step", State = TimelineState.Success }.Write(c)
        Assert.DoesNotContain("\u001b[3", c.Output)
        Assert.DoesNotContain("\u001b[9", c.Output)
    }

    @Fact
    func Ascii_Mode_Uses_Ascii_Glyphs_Only() {
        Theme.Reset()
        defer Theme.Reset()

        var c = NewConsole(120)
        TimelineItem() { Title = "x", State = TimelineState.Loading, UseAscii = true }.Write(c)
        TimelineItem() { Title = "y", State = TimelineState.Success, UseAscii = true }.Write(c)
        let output = c.Output
        Assert.DoesNotContain("◐", output)
        Assert.DoesNotContain("✓", output)
        Assert.Contains("*", output)
        Assert.Contains("+", output)
    }
}
