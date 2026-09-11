package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Shell
import System.IO
import Xunit

class AltScreenTests {
    @Fact
    func SyncSequences_AreValidDecPrivateMode2026() {
        Assert.Equal("\u001B[?2026h", AltScreen.SyncStartSequence)
        Assert.Equal("\u001B[?2026l", AltScreen.SyncEndSequence)
    }

    @Fact
    func EnterSequence_SwitchesToAltScreenAndHidesCursor() {
        Assert.Contains("\u001B[?1049h", AltScreen.EnterSequence)
        Assert.Contains("\u001B[?25l", AltScreen.EnterSequence)
    }

    @Fact
    func LeaveSequence_RestoresPrimaryBufferAndShowsCursor() {
        Assert.Contains("\u001B[?25h", AltScreen.LeaveSequence)
        Assert.Contains("\u001B[?1049l", AltScreen.LeaveSequence)
    }

    /// Regression: on Windows, StringWriter.NewLine is \r\n. If the frame
    /// post-process only replaces \n with \e[K\n, the result is \r\e[K\n
    /// which moves the cursor to column 1 then erases the entire line,
    /// producing a blank screen.
    @Fact
    func InjectEraseBeforeNewlines_CrLf_MustNotProduceCrEscK() {
        // Simulate a Windows-style StringWriter (CRLF newlines).
        let sw = StringWriter{NewLine: "\r\n"}
        sw.Write("Header")
        sw.WriteLine()
        sw.Write("Body")
        sw.WriteLine()
        let frame = AltScreen.InjectEraseBeforeNewlines(sw.ToString())
        Assert.DoesNotContain("\r\u001B[K", frame) // would erase each line
        Assert.Contains("Header\u001B[K\n", frame)
        Assert.Contains("Body\u001B[K\n", frame)
    }

    /// Even when the StringWriter uses LF-only newlines (macOS/Linux),
    /// the post-process should still inject \e[K before each \n.
    @Fact
    func InjectEraseBeforeNewlines_LfOnly_InjectsEraseBeforeNewline() {
        let sw = StringWriter{NewLine: "\n"}
        sw.Write("Line1")
        sw.WriteLine()
        sw.Write("Line2")
        sw.WriteLine()
        let frame = AltScreen.InjectEraseBeforeNewlines(sw.ToString())
        Assert.Equal("Line1\u001B[K\nLine2\u001B[K\n", frame)
    }

    @Fact
    func InjectEraseBeforeNewlines_StripsLoneCarriageReturns() {
        let frame = AltScreen.InjectEraseBeforeNewlines("a\rb\nc")
        Assert.Equal("ab\u001B[K\nc", frame)
    }

    @Fact
    func InjectEraseBeforeNewlines_EmptyOrNull_ReturnsEmpty() {
        Assert.Equal(string.Empty, AltScreen.InjectEraseBeforeNewlines(string.Empty))
        Assert.Equal(string.Empty, AltScreen.InjectEraseBeforeNewlines(nil))
    }
}
