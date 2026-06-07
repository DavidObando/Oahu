// G# port of Tui/CtrlCStateTests.cs.
//
// Tests the progressive Ctrl+C state machine: first press shows prompt,
// second press within window exits, timeout resets, active job cancels, etc.
//
// NOTE: G# closures capture value types by value; we use a reference-type
// holder class for the mutable clock so the lambda sees updates.

package Oahu.Cli.Tests.Experiment.Tui

import System
import Oahu.Cli.Tui.Shell
import Xunit

// Helper: reference-type holder so closures see updated DateTimeOffset.
type ClockHolder class {
    Value DateTimeOffset
    init() {}
}

type CtrlCStateTests class {
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
        var clock = ClockHolder()
        clock.Value = DateTimeOffset.UtcNow
        var state = CtrlCState(func() DateTimeOffset { return clock.Value })
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
        // Advance 1 second - well within the default 2s window.
        clock.Value = clock.Value.AddSeconds(1.0)
        Assert.Equal(CtrlCAction.Exit, state.OnPress())
    }

    @Fact
    func Second_Press_After_Window_Reprompts() {
        var clock = ClockHolder()
        clock.Value = DateTimeOffset.UtcNow
        var state = CtrlCState(func() DateTimeOffset { return clock.Value })
        Assert.Equal(CtrlCAction.PromptToExit, state.OnPress())
        clock.Value = clock.Value.AddSeconds(5.0)
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
