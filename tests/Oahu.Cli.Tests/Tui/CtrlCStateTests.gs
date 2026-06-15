// G# port of Tui/CtrlCStateTests.cs.
//
// Tests the progressive Ctrl+C state machine.
// (0.1.459: closures now capture value-type locals by reference per gsharp#523.)

package Oahu.Cli.Tests.Tui

import System
import Oahu.Cli.Tui.Shell
import Xunit

class CtrlCStateTests {
    @Fact
    func First_Press_With_No_Active_Job_Shows_Prompt() {
        var state = CtrlCState()
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
        Assert.True(state.ToastActive)
    }

    @Fact
    func Active_Job_Cancels_First() {
        var state = CtrlCState()
        state.HasActiveJob = true
        Assert.Equal(CtrlCAction.CancelActiveJob, state.OnPress())
        Assert.False(state.ToastActive)
    }

    @Fact
    func Open_Dialog_Closes_When_No_Job() {
        var state = CtrlCState()
        state.HasOpenDialog = true
        Assert.Equal(CtrlCAction.CloseDialog, state.OnPress())
    }

    @Fact
    func Second_Press_Within_Window_Exits() {
        var now = DateTimeOffset.UtcNow
        var state = CtrlCState(func() DateTimeOffset { return now })
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
        now = now.AddSeconds(1.0)
        Assert.Equal(CtrlCAction.Exit, state.OnPress())
    }

    @Fact
    func Second_Press_After_Window_Reprompts() {
        var now = DateTimeOffset.UtcNow
        var state = CtrlCState(func() DateTimeOffset { return now })
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
        now = now.AddSeconds(5.0)
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
    }

    @Fact
    func Reset_Clears_Toast() {
        var state = CtrlCState()
        state.OnPress()
        Assert.True(state.ToastActive)
        state.Reset()
        Assert.False(state.ToastActive)
    }
}
