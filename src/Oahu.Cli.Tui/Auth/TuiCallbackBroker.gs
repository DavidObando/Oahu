package Oahu.Cli.Tui.Auth

import Oahu.Cli.App.Auth
import System
import System.Collections.Concurrent
import System.Threading
import System.Threading.Tasks

/// Request from the auth background thread to the TUI main thread.
/// The TUI shell creates the appropriate modal, and the completion source
/// is set when the user responds.
class ModalRequest {
    init() {
        Completion = TaskCompletionSource[string](TaskCreationOptions.RunContinuationsAsynchronously)
    }

    prop Challenge CallbackChallenge {
        get;
        init;
    }

    prop Completion TaskCompletionSource[string] {
        get;
        init;
    }
}

/// TUI-side implementation of (cref:IAuthCallbackBroker). Each
/// challenge method posts a (cref:ModalRequest) to a concurrent queue
/// and awaits the result. The AppShell input loop polls
/// (cref:TryDequeue) and creates a matching modal; when the user
/// submits the modal result, it sets the completion source.
class TuiCallbackBroker : IAuthCallbackBroker {
    private let requests ConcurrentQueue[ModalRequest] = ConcurrentQueue[ModalRequest]()

    /// Try to dequeue the next pending modal request.
    func TryDequeue(out request ModalRequest?) bool -> requests.TryDequeue(out request)

    /// Whether there are pending requests.
    prop HasPending bool -> !requests.IsEmpty

    async func SolveCaptchaAsync(challenge CaptchaChallenge, cancellationToken CancellationToken) string {
        let req = ModalRequest{Challenge: challenge}
        requests.Enqueue(req)
        using let reg = cancellationToken.Register(() -> req.Completion.TrySetCanceled(cancellationToken))
        return await req.Completion.Task.ConfigureAwait(false)
    }

    async func SolveMfaAsync(challenge MfaChallenge, cancellationToken CancellationToken) string {
        let req = ModalRequest{Challenge: challenge}
        requests.Enqueue(req)
        using let reg = cancellationToken.Register(() -> req.Completion.TrySetCanceled(cancellationToken))
        return await req.Completion.Task.ConfigureAwait(false)
    }

    async func SolveCvfAsync(challenge CvfChallenge, cancellationToken CancellationToken) string {
        let req = ModalRequest{Challenge: challenge}
        requests.Enqueue(req)
        using let reg = cancellationToken.Register(() -> req.Completion.TrySetCanceled(cancellationToken))
        return await req.Completion.Task.ConfigureAwait(false)
    }

    async func ConfirmApprovalAsync(challenge ApprovalChallenge, cancellationToken CancellationToken) {
        let req = ModalRequest{Challenge: challenge}
        requests.Enqueue(req)
        using let reg = cancellationToken.Register(() -> req.Completion.TrySetCanceled(cancellationToken))
        await req.Completion.Task.ConfigureAwait(false)
    }

    async func CompleteExternalLoginAsync(challenge ExternalLoginChallenge, cancellationToken CancellationToken) Uri {
        let req = ModalRequest{Challenge: challenge}
        requests.Enqueue(req)
        using let reg = cancellationToken.Register(() -> req.Completion.TrySetCanceled(cancellationToken))
        let result = await req.Completion.Task.ConfigureAwait(false)
        if !Uri.TryCreate(result, UriKind.Absolute, out var uri) {
            throw InvalidOperationException("The pasted text is not a valid absolute URL.")
        }
        return uri
    }
}
