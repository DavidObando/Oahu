package Oahu.Cli.App.Jobs

import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.Runtime.CompilerServices
import System.Threading
import System.Threading.Tasks

/// Scripted executor used by tests and (via `oahu-cli ui-preview-jobs` later)
/// by humans verifying TUI animations. Walks Licensing → Downloading → Decrypting →
/// Exporting → Completed with token-checked sleep durations between phases.
class FakeJobExecutor : IJobExecutor {
    private let delayPerPhase TimeSpan
    private let failAtDecrypt bool

    init(delayPerPhase TimeSpan? = nil, failAtDecrypt bool = false) {
        this.delayPerPhase = delayPerPhase ?? TimeSpan.FromMilliseconds(5)
        this.failAtDecrypt = failAtDecrypt
    }

    async func ExecuteAsync(
        request JobRequest,
        @System.Runtime.CompilerServices.EnumeratorCancellation cancellationToken CancellationToken
    ) IAsyncEnumerable[JobUpdate] {
        yield JobUpdate{JobId: request.Id, Phase: JobPhase.Licensing, Message: "Requesting license"}
        await Task.Delay(delayPerPhase, cancellationToken).ConfigureAwait(false)
        yield JobUpdate{JobId: request.Id, Phase: JobPhase.Downloading, Progress: 0}
        await Task.Delay(delayPerPhase, cancellationToken).ConfigureAwait(false)
        yield JobUpdate{JobId: request.Id, Phase: JobPhase.Downloading, Progress: 1}
        if failAtDecrypt {
            yield JobUpdate{JobId: request.Id, Phase: JobPhase.Failed, Message: "Decrypt simulated failure"}
            yield break
        }
        yield JobUpdate{JobId: request.Id, Phase: JobPhase.Decrypting, Progress: 0}
        await Task.Delay(delayPerPhase, cancellationToken).ConfigureAwait(false)
        yield JobUpdate{JobId: request.Id, Phase: JobPhase.Decrypting, Progress: 1}
        yield JobUpdate{JobId: request.Id, Phase: JobPhase.Exporting}
        await Task.Delay(delayPerPhase, cancellationToken).ConfigureAwait(false)
        yield JobUpdate{JobId: request.Id, Phase: JobPhase.Completed}
    }
}
