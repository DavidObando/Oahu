// G# port of Tui/SignInFlowTests.cs (partial).
//
// Covers: RegionPickerModal navigation/selection/cancellation,
// ExternalLoginModal escape, ChallengeModal text entry,
// and PulseSpinner frame cycling.
//
// LIMITATIONS:
// - String/char[] iteration yields garbled char values at runtime (new anomaly).
//   Tests that type long strings via iteration are dropped.
// - CredentialsModal ctor has nullable param (string?) → invisible (GS0130). Drop.
// - ChallengeModal ApprovalOnly is init-only → approval test dropped.
// - PulseSpinner UseAscii is init-only → ascii test dropped.
// - TuiCallbackBroker tests are async (gsharp#502) and ModalRequest has required init. Drop.
// - SignInFlow/AppShell tests need fake interfaces (GS0157). Drop.
// - AppShell tests need nested type IKeyReader and TestConsole init properties. Drop.

package Oahu.Cli.Tests.Experiment.Tui

import System
import Oahu.Cli.Tui.Auth
import Oahu.Cli.Tui.Widgets
import Xunit

type SignInFlowTests class {
    func MakeKey(key ConsoleKey) ConsoleKeyInfo {
        return ConsoleKeyInfo(char(0), key, false, false, false)
    }

    func TypeChar(modal RegionPickerModal, ch char) {
        modal.HandleKey(ConsoleKeyInfo(ch, ConsoleKey.NoName, false, false, false))
    }

    @Fact
    func RegionPicker_Returns_Selected_Region() {
        var modal = RegionPickerModal()
        Assert.False(modal.IsComplete)

        // Move down to UK
        modal.HandleKey(MakeKey(ConsoleKey.DownArrow))
        modal.HandleKey(MakeKey(ConsoleKey.Enter))

        Assert.True(modal.IsComplete)
        Assert.False(modal.WasCancelled)
        Assert.Equal("uk", modal.Result)
    }

    @Fact
    func RegionPicker_Escape_Cancels() {
        var modal = RegionPickerModal()
        modal.HandleKey(MakeKey(ConsoleKey.Escape))
        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
    }

    @Fact
    func RegionPicker_First_Item_Is_US() {
        var modal = RegionPickerModal()
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.Equal("us", modal.Result)
    }

    @Fact
    func ExternalLogin_Escape_Cancels() {
        var modal = ExternalLoginModal(Uri("https://audible.com/login"))
        modal.HandleKey(MakeKey(ConsoleKey.Escape))
        Assert.True(modal.IsComplete)
        Assert.True(modal.WasCancelled)
    }

    @Fact
    func ExternalLogin_Rejects_Empty_Enter() {
        // Empty submit stays open
        var modal = ExternalLoginModal(Uri("https://audible.com/login"))
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.False(modal.IsComplete)
    }

    @Fact
    func ChallengeModal_Accepts_Text() {
        // Note: Title and Instructions are required init-only but G# doesn't
        // enforce 'required'; HandleKey logic doesn't use them so test is valid.
        var modal = ChallengeModal()
        // Type each character individually (string iteration garbles chars)
        modal.HandleKey(ConsoleKeyInfo('1', ConsoleKey.NoName, false, false, false))
        modal.HandleKey(ConsoleKeyInfo('2', ConsoleKey.NoName, false, false, false))
        modal.HandleKey(ConsoleKeyInfo('3', ConsoleKey.NoName, false, false, false))
        modal.HandleKey(ConsoleKeyInfo('4', ConsoleKey.NoName, false, false, false))
        modal.HandleKey(ConsoleKeyInfo('5', ConsoleKey.NoName, false, false, false))
        modal.HandleKey(ConsoleKeyInfo('6', ConsoleKey.NoName, false, false, false))
        modal.HandleKey(MakeKey(ConsoleKey.Enter))
        Assert.True(modal.IsComplete)
        Assert.Equal("123456", modal.Result)
    }

    @Fact
    func PulseSpinner_Cycles_Frames_With_Constant_Width() {
        var spinner = PulseSpinner()
        var allSingleWidth = true
        var uniqueCount = 0
        var first = ""
        var second = ""

        var i = 0
        for i < 12 {
            var glyph = spinner.Glyph
            if glyph.Length != 1 {
                allSingleWidth = false
            }
            if uniqueCount == 0 {
                first = glyph
                uniqueCount = 1
            } else if uniqueCount == 1 && glyph != first {
                second = glyph
                uniqueCount = 2
            }
            spinner.Tick()
            i = i + 1
        }

        Assert.True(allSingleWidth)
        Assert.True(uniqueCount > 1)
    }
}
