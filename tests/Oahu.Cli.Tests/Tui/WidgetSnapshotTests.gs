package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Themes
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Testing
import System
import System.Collections.Generic
import Xunit

@Collection("EnvVarSerial")
class WidgetSnapshotTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() -> Theme.Reset()

    @Fact
    func StatusLine_Includes_Verb_Hint_And_Metric() {
        let c = NewConsole()
        StatusLine{Verb: "Decrypting", Hint: "Esc to cancel", Metric: "42 MB"}.Write(c)
        let output = c.Output
        Assert.Contains("Decrypting", output)
        Assert.Contains("Esc to cancel", output)
        Assert.Contains("42 MB", output)
    }

    @Fact
    func HintBar_Filters_Empty_Actions() {
        let c = NewConsole()
        HintBar().Add("Tab", "next").Add("Enter", nil).Add("Esc", string.Empty).Add("?", "help").Write(c)
        let output = c.Output
        Assert.Contains("Tab", output)
        Assert.Contains("next", output)
        Assert.Contains("?", output)
        Assert.Contains("help", output)
        // Nothing should appear for the suppressed bindings.
        Assert.DoesNotContain("Enter", output)
    }

    @Fact
    func HintBar_Empty_Is_NoOp() {
        let c = NewConsole()
        HintBar().Write(c)
        // Spectre TestConsole always emits "\n" regardless of host OS.
        Assert.Equal("\n", c.Output)
    }

    @Fact
    func TimelineItem_Prefix_Width_Constant_Across_States() {
        // Render the same title in two different states; confirm the column where the title
        // begins is identical. This is the core "no layout shift" invariant from §6.5.
        let loading = RenderItem(TimelineItem{Title: "Doing", State: TimelineState.Loading})
        let success = RenderItem(TimelineItem{Title: "Doing", State: TimelineState.Success})
        let error = RenderItem(TimelineItem{Title: "Doing", State: TimelineState.Error})
        let loadingTitle = loading.IndexOf("Doing", StringComparison.Ordinal)
        let successTitle = success.IndexOf("Doing", StringComparison.Ordinal)
        let errorTitle = error.IndexOf("Doing", StringComparison.Ordinal)
        Assert.True(loadingTitle > 0)
        Assert.Equal(loadingTitle, successTitle)
        Assert.Equal(loadingTitle, errorTitle)
    }

    @Fact
    func TimelineItem_Renders_Detail_Indented() {
        let c = NewConsole()
        TimelineItem{
            Title: "Library cache",
            Description: "287 books",
            State: TimelineState.Info,
            Detail: "→ run 'library sync'"
        }.Write(c)
        Assert.Contains("Library cache", c.Output)
        Assert.Contains("287 books", c.Output)
        Assert.Contains("library sync", c.Output)
    }

    @Fact
    func SelectList_Marks_Cursor_And_Selection() {
        let c = NewConsole()
        SelectList[string]{
            Items: []string{"alpha", "beta", "gamma"},
            Format: (s string) -> s,
            CursorIndex: 1,
            SelectedIndices: HashSet[int32]{0}
        }.Write(c)
        let output = c.Output
        Assert.Contains("alpha", output)
        Assert.Contains("beta", output)
        Assert.Contains("gamma", output)
        // Cursor glyph (❯) and filled marker (●) should be emitted.
        Assert.Contains("❯", output)
        Assert.Contains("●", output)
    }

    @Fact
    func Dialog_Wraps_Body_And_Footer() {
        let c = NewConsole()
        Dialog{Title: "Heads up", Body: Markup("Body text"), Footer: HintBar().Add("Esc", "dismiss")}.Write(c)
        let output = c.Output
        Assert.Contains("Heads up", output)
        Assert.Contains("Body text", output)
        Assert.Contains("Esc", output)
        Assert.Contains("dismiss", output)
    }

    @Fact
    func StyledTable_Adds_Bold_Headers_And_Rows() {
        let c = NewConsole()
        let t = StyledTable.Create().AddBoldColumn("Title").AddBoldColumn("Author")
        t.AddRow("Project Hail Mary", "Andy Weir")
        c.Write(t)
        let output = c.Output
        Assert.Contains("Title", output)
        Assert.Contains("Author", output)
        Assert.Contains("Andy Weir", output)
    }

    @Fact
    func Mono_Theme_Renders_Without_Ansi_Escapes() {
        Theme.Use("Mono")
        let c = NewConsole()
        c.EmitAnsiSequences = true // ensure we'd see escapes if any were emitted
        StatusLine{Verb: "Working"}.Write(c)
        TimelineItem{Title: "Step", State: TimelineState.Success}.Write(c)
        // Mono uses Color.Default for every token — Spectre suppresses colour markup for it.
        Assert.DoesNotContain("\u001B[3", c.Output) // foreground SGR like ESC[31m, ESC[32m, etc.
        Assert.DoesNotContain("\u001B[9", c.Output) // bright-foreground SGR like ESC[91m

    }

    @Fact
    func Ascii_Mode_Uses_Ascii_Glyphs_Only() {
        let c = NewConsole()
        TimelineItem{Title: "x", State: TimelineState.Loading, UseAscii: true}.Write(c)
        TimelineItem{Title: "y", State: TimelineState.Success, UseAscii: true}.Write(c)
        let output = c.Output
        Assert.DoesNotContain("◐", output)
        Assert.DoesNotContain("✓", output)
        Assert.Contains("*", output) // Working ASCII fallback
        Assert.Contains("+", output) // Success ASCII fallback (will be confirmed by IconsTests)

    }

    shared {
        private func NewConsole(width int32 = 120) TestConsole {
            let c = TestConsole()
            c.Profile.Width = width
            c.EmitAnsiSequences = false
            return c
        }

        private func RenderItem(item TimelineItem) string {
            let c = NewConsole()
            item.Write(c)
            return c.Output
        }
    }
}
