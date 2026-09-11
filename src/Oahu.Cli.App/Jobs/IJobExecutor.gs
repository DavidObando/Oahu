package Oahu.Cli.App.Jobs

import Oahu.Cli.App.Models
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// Pluggable strategy for actually performing one (cref:JobRequest).
/// Phase 3 ships a `FakeJobExecutor` that scripts the phase transitions;
/// Phase 4 ships `AudibleJobExecutor` backed by `Oahu.Core.AudibleApi`
/// + `DownloadDecryptJob`.
interface IJobExecutor {
    /// Executes [`request`](paramref). Yields one update per phase change (and
    /// optionally interim progress updates within a phase). Must yield a terminal
    /// update (Completed / Failed / Canceled) before returning.
    func ExecuteAsync(request JobRequest, cancellationToken CancellationToken) IAsyncEnumerable[JobUpdate];
}
