package Oahu.Cli.App.Auth

import System
import System.Threading
import System.Threading.Tasks

/// Non-interactive broker that fails fast on every challenge. Used as the default
/// when the runtime detects `--no-prompt`, a non-TTY stdin, or the MCP
/// "unattended" mode (Phase 5). Phase 6 swaps in a Spectre-dialog broker for the
/// TUI; Phase 4 wires (cref:StdinCallbackBroker) into command mode.
class NonInteractiveCallbackBroker : IAuthCallbackBroker {
    func SolveCaptchaAsync(c CaptchaChallenge, ct CancellationToken) Task[string] {
        throw NonInteractiveCallbackException("captcha")
    }

    func SolveMfaAsync(c MfaChallenge, ct CancellationToken) Task[string] {
        throw NonInteractiveCallbackException("mfa")
    }

    func SolveCvfAsync(c CvfChallenge, ct CancellationToken) Task[string] {
        throw NonInteractiveCallbackException("cvf")
    }

    func ConfirmApprovalAsync(c ApprovalChallenge, ct CancellationToken) Task {
        throw NonInteractiveCallbackException("approval")
    }

    func CompleteExternalLoginAsync(c ExternalLoginChallenge, ct CancellationToken) Task[Uri] {
        throw NonInteractiveCallbackException("external-login")
    }
}
