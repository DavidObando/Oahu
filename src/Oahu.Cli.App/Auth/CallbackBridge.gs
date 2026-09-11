package Oahu.Cli.App.Auth

import Oahu.Core
import System
import System.Threading
import System.Threading.Tasks

/// Adapts the CLI's async (cref:IAuthCallbackBroker) to Core's synchronous
/// (cref:Callbacks) delegates. Core invokes the resulting delegates on
/// background threads (typically inside (cref:Task.Run(Func{Task}))
/// — see `AudibleClient.ConfigFromProgrammaticLoginAsync`) so blocking via
/// `GetAwaiter().GetResult()` does not deadlock the calling thread.
///
/// The bridge intentionally swallows nothing: if the broker raises
/// (cref:NonInteractiveCallbackException) the underlying Core operation
/// receives the same exception and surfaces it to the CLI.
class CallbackBridge {
    shared {
        func ToCoreCallbacks(broker IAuthCallbackBroker, cancellationToken CancellationToken) Callbacks {
            ArgumentNullException.ThrowIfNull(broker)
            return Callbacks{
                CaptchaCallback: (imageBytes[]uint8) -> broker
                    .SolveCaptchaAsync(CaptchaChallenge(imageBytes), cancellationToken)
                    .ConfigureAwait(false)
                    .GetAwaiter()
                    .GetResult(),
                MfaCallback: () -> broker
                    .SolveMfaAsync(MfaChallenge(), cancellationToken)
                    .ConfigureAwait(false)
                    .GetAwaiter()
                    .GetResult(),
                CvfCallback: () -> broker
                    .SolveCvfAsync(CvfChallenge(), cancellationToken)
                    .ConfigureAwait(false)
                    .GetAwaiter()
                    .GetResult(),
                ApprovalCallback: () -> broker
                    .ConfirmApprovalAsync(ApprovalChallenge(), cancellationToken)
                    .ConfigureAwait(false)
                    .GetAwaiter()
                    .GetResult(),
                ExternalLoginCallback: (uri Uri) -> broker
                    .CompleteExternalLoginAsync(ExternalLoginChallenge(uri), cancellationToken)
                    .ConfigureAwait(false)
                    .GetAwaiter()
                    .GetResult(),
                DeregisterDeviceConfirmCallback: (_ IProfileKeyEx) -> true,
                GetAccountAliasFunc: (ctxt AccountAliasContext) -> {
                    if string.IsNullOrWhiteSpace(ctxt.Alias) {
                        ctxt.Alias = ctxt.CustomerName!!
                    }
                    return true
                }
            }
        }
    }
}
