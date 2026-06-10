// G# port of src/Oahu.Cli.App/Auth/NonInteractiveCallbackBroker.cs.
// Reuses the C# IAuthCallbackBroker + challenge records from the referenced
// Oahu.Cli.App assembly so we don't have to port the record hierarchy.
// C# uses NonInteractiveCallbackException; here we use InvalidOperationException
// (G# 0.1.516 has no clean `super(string)` chaining for custom Exception classes).

package Oahu.Cli.App.Experiment.Auth

import System
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Auth

type ExpNonInteractiveCallbackBroker class : IAuthCallbackBroker {
    func SolveCaptchaAsync(c CaptchaChallenge, ct CancellationToken) Task[string] {
        return Task.FromException[string](makeError("captcha"))
    }

    func SolveMfaAsync(c MfaChallenge, ct CancellationToken) Task[string] {
        return Task.FromException[string](makeError("mfa"))
    }

    func SolveCvfAsync(c CvfChallenge, ct CancellationToken) Task[string] {
        return Task.FromException[string](makeError("cvf"))
    }

    func ConfirmApprovalAsync(c ApprovalChallenge, ct CancellationToken) Task {
        return Task.FromException(makeError("approval"))
    }

    func CompleteExternalLoginAsync(c ExternalLoginChallenge, ct CancellationToken) Task[Uri] {
        return Task.FromException[Uri](makeError("external-login"))
    }

    func makeError(kind string) Exception {
        return InvalidOperationException("Cannot handle '" + kind + "' interactively in non-interactive mode.")
    }
}
