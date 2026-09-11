package Oahu.Cli.Tui.Shell

import System

/// Progressive `Ctrl+C` state machine, per design §10 / TUI exploration §14.
///
/// The shell asks (cref:OnPress) what to do for each Ctrl+C press; the
/// state machine returns one of (cref:CtrlCAction) values:
///
/// 1. (cref:CtrlCAction.CancelActiveJob) — a job is running, cancel it.
/// 2. (cref:CtrlCAction.CloseDialog) — a modal dialog is open, close it.
/// 3. (cref:CtrlCAction.PromptToExit) — show "Press Ctrl+C again to quit" toast.
/// 4. (cref:CtrlCAction.Exit) — second press within window, leave the TUI.
///
/// The shell is responsible for telling the state machine what's currently
/// happening (active job? open dialog?) before it presses the button —
/// that's what the (cref:HasActiveJob) / (cref:HasOpenDialog)
/// flags are for.
class CtrlCState {
    /// Window during which a second Ctrl+C escalates to exit.
    prop ExitWindow TimeSpan {
        get;
        init;
    }

    /// Set by the shell — true when a cancellable job is running.
    prop HasActiveJob bool

    /// Set by the shell — true when a modal dialog is open.
    prop HasOpenDialog bool

    private let clock() -> DateTimeOffset
    private var promptShownAt DateTimeOffset?

    init(clock(() -> DateTimeOffset)? = nil) {
        ExitWindow = TimeSpan.FromSeconds(2)
        this.clock = clock ?? (() -> DateTimeOffset.UtcNow)
    }

    /// True while the "press Ctrl+C again to quit" toast is active.
    prop ToastActive bool {
        get {
            if promptShownAt is not{} at {
                return false
            }
            return clock() - at <= ExitWindow
        }
    }

    /// Compute the next action for a Ctrl+C press, then advance the state.
    func OnPress() CtrlCAction {
        let now = clock()
        // Second press within the exit window? Leave the shell, regardless of the rest.
        if promptShownAt is {} at && now - at <= ExitWindow {
            promptShownAt = nil
            return CtrlCAction.Exit
        }
        if HasActiveJob {
            return CtrlCAction.CancelActiveJob
        }
        if HasOpenDialog {
            return CtrlCAction.CloseDialog
        }
        promptShownAt = now
        return CtrlCAction.PromptToExit
    }

    /// Cancel the toast / pending exit.
    func Reset() {
        promptShownAt = nil
    }
}

enum CtrlCAction {
    CancelActiveJob,
    CloseDialog,
    PromptToExit,
    Exit
}
