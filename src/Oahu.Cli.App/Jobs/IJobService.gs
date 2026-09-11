package Oahu.Cli.App.Jobs

import Oahu.Cli.App.Models
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// The Phase 3 / 4 face of the job system used by commands and (Phase 5) the server.
interface IJobService {
    /// Submit a job. The returned task completes when the scheduler has accepted the
    /// request (it may block briefly for backpressure when the worker channel is full).
    /// Use (cref:ObserveAll) or (cref:ObserveAsync(string, CancellationToken)) to track progress.
    func SubmitAsync(request JobRequest, cancellationToken CancellationToken = default(CancellationToken)) Task;

    /// Observe every update from every job (live + future).
    func ObserveAll(cancellationToken CancellationToken = default(CancellationToken)) IAsyncEnumerable[JobUpdate];

    /// Observe updates for a specific job. Completes when that job reaches a terminal phase.
    func ObserveAsync(jobId string, cancellationToken CancellationToken = default(CancellationToken)) IAsyncEnumerable[
        JobUpdate
    ];

    /// Cooperatively cancel a running or queued job. Returns true if the job was found.
    func Cancel(jobId string) bool;

    /// Latest-known status of one in-flight job, or null if the job is unknown to the
    /// scheduler (either it has already reached a terminal state and rolled to history,
    /// or the id was never submitted). Lets HTTP/MCP clients poll without subscribing.
    func GetSnapshot(jobId string) JobSnapshot?;

    /// Latest-known status of every job currently tracked by the scheduler.
    func ListActive() IReadOnlyList[JobSnapshot];

    /// Read the on-disk history (terminal-state job records).
    func ReadHistoryAsync(cancellationToken CancellationToken = default(CancellationToken)) IAsyncEnumerable[JobRecord];
}
