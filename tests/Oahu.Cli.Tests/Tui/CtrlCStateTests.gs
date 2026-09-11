package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Shell
import System
import Xunit

class CtrlCStateTests {
    @Fact
    func First_Press_With_No_Active_Job_Shows_Prompt() {
        let state = CtrlCState()
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
        Assert.True(state.ToastActive)
    }

    @Fact
    func Active_Job_Cancels_First() {
        let state = CtrlCState(default((() -> DateTimeOffset)?)){HasActiveJob = true}
        Assert.Equal(CtrlCAction.CancelActiveJob, state.OnPress())
        Assert.False(state.ToastActive)
    }

    @Fact
    func Open_Dialog_Closes_When_No_Job() {
        let state = CtrlCState(default((() -> DateTimeOffset)?)){HasOpenDialog = true}
        Assert.Equal(CtrlCAction.CloseDialog, state.OnPress())
    }

    @Fact
    func Second_Press_Within_Window_Exits() {
        var t = DateTimeOffset.UtcNow
        let state = CtrlCState(clock: () -> t)
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
        // Advance 1 second — well within the default 2s window.
        t = t.AddSeconds(1.0)
        Assert.Equal(CtrlCAction.Exit, state.OnPress())
    }

    @Fact
    func Second_Press_After_Window_Reprompts() {
        var t = DateTimeOffset.UtcNow
        let state = CtrlCState(clock: () -> t)
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
        t = t.AddSeconds(5.0)
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
    }

    @Fact
    func Reset_Clears_Toast() {
        let state = CtrlCState()
        state.OnPress()
        Assert.True(state.ToastActive)
        state.Reset()
        Assert.False(state.ToastActive)
    }
}
