package Oahu.Cli.App.Auth

import System
import System.Threading
import System.Threading.Tasks

/// Typed representation of a single Audible-side challenge that needs human input.
/// Mirrors `Oahu.Core.Callbacks` but in CLI-owned types so the broker can be
/// driven from stdin (command mode) or Spectre dialogs (TUI / Phase 6) without
/// either of those layers depending on Oahu.Core.
open data class CallbackChallenge {
    open prop Kind string {
        get;
    }
}

open data class CaptchaChallenge(ImageBytes[]uint8) : CallbackChallenge {
    open override prop Kind string -> "captcha"
}

open data class MfaChallenge() : CallbackChallenge {
    open override prop Kind string -> "mfa"
}

open data class CvfChallenge() : CallbackChallenge {
    open override prop Kind string -> "cvf"
}

open data class ApprovalChallenge() : CallbackChallenge {
    open override prop Kind string -> "approval"
}

open data class ExternalLoginChallenge(LoginUri Uri) : CallbackChallenge {
    open override prop Kind string -> "external-login"
}

/// Human-in-the-loop bridge for Audible login challenges. Implementations decide
/// where to surface the prompt (stdin, dialog, MCP request, …) and return the
/// user's answer.
interface IAuthCallbackBroker {
    func SolveCaptchaAsync(challenge CaptchaChallenge, cancellationToken CancellationToken) Task[string];

    func SolveMfaAsync(challenge MfaChallenge, cancellationToken CancellationToken) Task[string];

    func SolveCvfAsync(challenge CvfChallenge, cancellationToken CancellationToken) Task[string];

    func ConfirmApprovalAsync(challenge ApprovalChallenge, cancellationToken CancellationToken) Task;

    /// Show [`challenge`](paramref) and return the URI the user pasted back from the browser.
    func CompleteExternalLoginAsync(challenge ExternalLoginChallenge, cancellationToken CancellationToken) Task[Uri];
}
