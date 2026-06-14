// G# port of Tui/AltScreenTests.cs.
//
// Verifies AltScreen ANSI sequences and the InjectEraseBeforeNewlines helper
// handles CRLF, LF, lone CR, empty/null cases.
//
// NOTE: G# does not support \n, \r, \uXXXX escape sequences in string
// literals. All control characters are constructed via Convert.ToChar().

package Oahu.Cli.Tests.Tui

import System
import System.IO
import Oahu.Cli.Tui.Shell
import Xunit

class AltScreenTests {
    // Helper to get control character strings
    func ESC() string { return Convert.ToChar(0x1b).ToString() }
    func LF() string { return Convert.ToChar(10).ToString() }
    func CR() string { return Convert.ToChar(13).ToString() }

    @Fact
    func SyncSequences_AreValidDecPrivateMode2026() {
        var e = ESC()
        Assert.Equal("${e}[?2026h", AltScreen.SyncStartSequence)
        Assert.Equal("${e}[?2026l", AltScreen.SyncEndSequence)
    }

    @Fact
    func EnterSequence_SwitchesToAltScreenAndHidesCursor() {
        var e = ESC()
        Assert.Contains("${e}[?1049h", AltScreen.EnterSequence)
        Assert.Contains("${e}[?25l", AltScreen.EnterSequence)
    }

    @Fact
    func LeaveSequence_RestoresPrimaryBufferAndShowsCursor() {
        var e = ESC()
        Assert.Contains("${e}[?25h", AltScreen.LeaveSequence)
        Assert.Contains("${e}[?1049l", AltScreen.LeaveSequence)
    }

    @Fact
    func InjectEraseBeforeNewlines_CrLf_MustNotProduceCrEscK() {
        var e = ESC()
        var lf = LF()
        var cr = CR()
        // Simulate a Windows-style StringWriter (CRLF newlines).
        var sw = StringWriter()
        sw.NewLine = "${cr}${lf}"
        sw.Write("Header")
        sw.WriteLine()
        sw.Write("Body")
        sw.WriteLine()

        var frame = AltScreen.InjectEraseBeforeNewlines(sw.ToString())

        Assert.DoesNotContain("${cr}${e}[K", frame)
        Assert.Contains("Header${e}[K${lf}", frame)
        Assert.Contains("Body${e}[K${lf}", frame)
    }

    @Fact
    func InjectEraseBeforeNewlines_LfOnly_InjectsEraseBeforeNewline() {
        var e = ESC()
        var lf = LF()
        var sw = StringWriter()
        sw.NewLine = lf
        sw.Write("Line1")
        sw.WriteLine()
        sw.Write("Line2")
        sw.WriteLine()

        var frame = AltScreen.InjectEraseBeforeNewlines(sw.ToString())

        Assert.Equal("Line1${e}[K${lf}Line2${e}[K${lf}", frame)
    }

    @Fact
    func InjectEraseBeforeNewlines_StripsLoneCarriageReturns() {
        var e = ESC()
        var lf = LF()
        var cr = CR()
        var frame = AltScreen.InjectEraseBeforeNewlines("a${cr}b${lf}c")

        Assert.Equal("ab${e}[K${lf}c", frame)
    }

    @Fact
    func InjectEraseBeforeNewlines_EmptyOrNull_ReturnsEmpty() {
        Assert.Equal("", AltScreen.InjectEraseBeforeNewlines(""))
        // LIMITATION: cannot pass null! in G#; skipping null test case
    }
}
