package Oahu.Cli.App.Jobs

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli.App
import Oahu.Cli.App.Models
import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.IO
import System.Linq
import System.Runtime.CompilerServices
import System.Threading
import System.Threading.Channels
import System.Threading.Tasks

class JobSchedulerOptions {
    init() {
        MaxParallelism = 1
        ChannelCapacity = 64
    }

    prop MaxParallelism int32 {
        get;
        init;
    }

    /// Bound on the worker channel; (cref:IJobService.SubmitAsync) async-waits when full.
    prop ChannelCapacity int32 {
        get;
        init;
    }

    /// Optional path to a JSON file that tracks active jobs across process
    /// restarts. When set, the scheduler atomically rewrites the file after
    /// every phase transition; on startup, any entries it finds are treated
    /// as "interrupted" — appended to history with phase
    /// (cref:JobPhase.Failed) and message
    /// `"interrupted (recovered on startup)"`, then cleared. Resumption
    /// is intentionally NOT attempted in v1: re-driving an Audible download
    /// from an unknown phase is risky without API-side checkpointing.
    prop ActiveJobsStatePath string? {
        get;
        init;
    }
}

/// Bounded-Channel-backed job scheduler. (cref:IJobService.SubmitAsync) awaits
/// when the worker buffer is full (so backpressure is invisible to the caller — never
/// throws "queue full"). Per-job updates are fanned out to any number of observers
/// via per-subscriber bounded channels; slow observers cannot stall the workers.
class JobScheduler : IJobService, IAsyncDisposable {
    private let executor IJobExecutor
    private let history JsonlHistoryStore?
    private let logger ILogger
    private let options JobSchedulerOptions
    private let work Channel[JobRequest]
    private let shutdownCts CancellationTokenSource = CancellationTokenSource()
    private let workers[]Task
    private let subscribers ConcurrentDictionary[Guid, Channel[JobUpdate]] = ConcurrentDictionary[
        Guid,
        Channel[JobUpdate]
    ]()
    private let jobs ConcurrentDictionary[string, JobLifecycle] = ConcurrentDictionary[string, JobLifecycle]()
    private var disposed int32

    init(
        executor IJobExecutor,
        history JsonlHistoryStore? = nil,
        options JobSchedulerOptions? = nil,
        logger ILogger[JobScheduler]? = nil
    ) {
        this.executor = executor ?? throw ArgumentNullException("executor")
        this.history = history
        this.options = options ?? JobSchedulerOptions()
        this.logger = logger ?? NullLogger[JobScheduler].Instance
        // Crash recovery: any jobs left in the active-state file from a prior
        // process are reported as Failed(interrupted) and dropped. Done before
        // workers start so recovered entries can't race the active map.
        RecoverInterruptedJobs()
        work = Channel.CreateBounded[JobRequest](
            BoundedChannelOptions(this.options.ChannelCapacity){
                FullMode = BoundedChannelFullMode.Wait,
                SingleReader = false,
                SingleWriter = false
            }
        )
        workers = [Math.Max(1, this.options.MaxParallelism)]Task
        for var i = 0; i < workers.Length; i++ {
            workers[i] = Task.Run(WorkerLoopAsync)
        }
    }

    async func SubmitAsync(request JobRequest, cancellationToken CancellationToken = default(CancellationToken)) {
        ArgumentNullException.ThrowIfNull(request)
        let lifecycle = JobLifecycle(request, DateTimeOffset.UtcNow)
        if !jobs.TryAdd(request.Id, lifecycle) {
            throw InvalidOperationException("Job ${request.Id} is already known to the scheduler.")
        }
        await Publish(JobUpdate{JobId: request.Id, Phase: JobPhase.Queued}).ConfigureAwait(false)
        try {
            await work.Writer.WriteAsync(request, cancellationToken).ConfigureAwait(false)
        } catch {
            // Channel write failed (caller cancellation, channel completed during shutdown, etc.).
            // Roll back the lifecycle so it doesn't linger forever with no worker to drive it.
            if jobs.TryRemove(request.Id, out var orphan) {
                try {
                    await Publish(
                        JobUpdate{
                            JobId: request.Id,
                            Phase: JobPhase.Canceled,
                            Message: "Submission canceled before queueing."
                        }
                    ).ConfigureAwait(false)
                } catch {
                    // best-effort

                }
                orphan.Cts.Dispose()
            }
            rethrow
        }
    }

    func ObserveAll(cancellationToken CancellationToken = default(CancellationToken)) IAsyncEnumerable[JobUpdate] {
        let (ch, key) = RegisterSubscriber()
        return Drain(ch, key, (_ JobUpdate) -> true, cancellationToken)
    }

    func ObserveAsync(jobId string, cancellationToken CancellationToken = default(CancellationToken)) IAsyncEnumerable[
        JobUpdate
    ] {
        ArgumentException.ThrowIfNullOrWhiteSpace(jobId)
        let (ch, key) = RegisterSubscriber()
        return Drain(ch, key, (u JobUpdate) -> u.JobId == jobId, cancellationToken)
    }

    func Cancel(jobId string) bool {
        if jobs.TryGetValue(jobId, out var lc) {
            lc.Cts.Cancel()
            return true
        }
        return false
    }

    func GetSnapshot(jobId string) JobSnapshot? -> if jobs.TryGetValue(jobId, out var lc) {
        Snapshot(lc)
    } else {
        default(JobSnapshot?)
    }

    func ListActive() IReadOnlyList[JobSnapshot] {
        let list = List[JobSnapshot](jobs.Count)
        for (_, lc) in jobs {
            list.Add(Snapshot(lc))
        }
        return list
    }

    func ReadHistoryAsync(cancellationToken CancellationToken = default(CancellationToken)) IAsyncEnumerable[
        JobRecord
    ] -> history?.ReadAllAsync(cancellationToken) ?? EmptyHistory(cancellationToken)

    async func DisposeAsync() ValueTask {
        if Interlocked.Exchange(&disposed, 1) != 0 {
            return
        }
        work.Writer.TryComplete()
        try {
            shutdownCts.Cancel()
        } catch (ObjectDisposedException) {
            // already disposed

        }
        try {
            await Task.WhenAll(workers).ConfigureAwait(false)
        } catch (OperationCanceledException) {
            // expected on shutdown

        }
        for sub in subscribers.Values {
            sub.Writer.TryComplete()
        }
        for (_, lc) in jobs {
            lc.Cts.Dispose()
        }
        shutdownCts.Dispose()
    }

    private async func WorkerLoopAsync() {
        try {
            while await work.Reader.WaitToReadAsync(shutdownCts.Token).ConfigureAwait(false) {
                while work.Reader.TryRead(out var request) {
                    await RunOneAsync(request).ConfigureAwait(false)
                }
            }
        } catch (OperationCanceledException) {
            // shutting down

        } catch (ex Exception) {
            logger.LogError(ex, "Job worker loop crashed.")
        }
    }

    private async func RunOneAsync(request JobRequest) {
        if !jobs.TryGetValue(request.Id, out var lifecycle) {
            return
        }
        let ct = lifecycle.Cts.Token
        var terminal = JobPhase.Completed
        var error string? = nil
        try {
            await for update in executor.ExecuteAsync(request, ct).ConfigureAwait(false) {
                await Publish(update).ConfigureAwait(false)
                if IsTerminal(update.Phase) {
                    terminal = update.Phase
                    error = if update.Phase == JobPhase.Failed {
                        update.Message
                    } else {
                        default(string?)
                    }
                }
            }
        } catch (OperationCanceledException) when ct.IsCancellationRequested {
            terminal = JobPhase.Canceled
            await Publish(JobUpdate{JobId: request.Id, Phase: JobPhase.Canceled, Message: "Canceled"}).ConfigureAwait(
                false
            )
        } catch (ex Exception) {
            terminal = JobPhase.Failed
            error = ex.Message
            await Publish(JobUpdate{JobId: request.Id, Phase: JobPhase.Failed, Message: ex.Message}).ConfigureAwait(
                false
            )
            logger.LogError(ex, "Job {Id} ({Asin}) failed.", request.Id, request.Asin)
        } finally {
            if jobs.TryRemove(request.Id, out var removed) {
                removed.Cts.Dispose()
            }
            history?.Append(
                JobRecord{
                    Id: request.Id,
                    Asin: request.Asin,
                    Title: request.Title,
                    TerminalPhase: terminal,
                    StartedAt: lifecycle.StartedAt,
                    CompletedAt: DateTimeOffset.UtcNow,
                    ErrorMessage: error,
                    ProfileAlias: request.ProfileAlias,
                    Quality: request.Quality
                }
            )
        }
    }

    private async func Publish(update JobUpdate) ValueTask {
        // Update the per-job lifecycle so GetSnapshot/ListActive return fresh state.
        if jobs.TryGetValue(update.JobId, out var lc) {
            lc.LastPhase = update.Phase
            lc.LastProgress = update.Progress ?? lc.LastProgress
            lc.LastMessage = update.Message ?? lc.LastMessage
            lc.LastUpdatedAt = update.Timestamp
        }
        for (key, ch) in subscribers {
            // Per-subscriber backpressure: drop oldest rather than stall the worker.
            // (Subscribers wanting reliable delivery must keep up with their channel.)
            // The channel is configured DropOldest, so TryWrite should always succeed
            // unless the writer was already completed. If it failed, the subscriber is
            // gone (its iterator finished/disposed) — drop it from the map and move on.
            // We never block the worker on a slow/dead observer.
            if !ch.Writer.TryWrite(update) {
                subscribers.TryRemove(key, out _)
                ch.Writer.TryComplete()
            }
        }
        PersistActiveJobs()
        await Task.CompletedTask.ConfigureAwait(false)
    }

    private func RegisterSubscriber()(Channel Channel[JobUpdate], Key Guid) {
        // Register synchronously at call time (NOT lazily inside the async
        // iterator) so that callers which subscribe-then-submit are
        // guaranteed to see every update produced after the call returns.
        let ch = Channel.CreateBounded[JobUpdate](
            BoundedChannelOptions(256){
                FullMode = BoundedChannelFullMode.DropOldest,
                SingleReader = true,
                SingleWriter = false
            }
        )
        let key = Guid.NewGuid()
        subscribers.TryAdd(key, ch)
        return (ch, key)
    }

    private async func Drain(
        ch Channel[JobUpdate],
        key Guid,
        filter(JobUpdate) -> bool,
        @EnumeratorCancellation cancellationToken CancellationToken
    ) IAsyncEnumerable[JobUpdate] {
        try {
            await for u in ch.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false) {
                if filter(u) {
                    yield u
                }
            }
        } finally {
            subscribers.TryRemove(key, out _)
            ch.Writer.TryComplete()
        }
    }

    private func RecoverInterruptedJobs() {
        let path = options.ActiveJobsStatePath
        if string.IsNullOrEmpty(path) || !File.Exists(path) {
            return
        }
        var entries List[PersistedJob]? = nil
        try {
            entries = AtomicFile.ReadJson[List[PersistedJob]](path!!)
        } catch (ex Exception) {
            logger.LogWarning(ex, "Could not read active-jobs state file '{Path}'; ignoring.", path!!)
        }
        if entries != nil && entries.Count > 0 && history != nil {
            for e in entries {
                try {
                    history!!.Append(
                        JobRecord{
                            Id: e.Id,
                            Asin: e.Asin,
                            Title: e.Title ?? string.Empty,
                            TerminalPhase: JobPhase.Failed,
                            StartedAt: e.StartedAt,
                            CompletedAt: DateTimeOffset.UtcNow,
                            ErrorMessage: "interrupted (recovered on startup)",
                            ProfileAlias: e.ProfileAlias,
                            Quality: e.Quality
                        }
                    )
                } catch (ex Exception) {
                    logger.LogWarning(ex, "Could not append recovery record for job {Id}.", e.Id)
                }
            }
        }
        try {
            File.Delete(path!!)
        } catch (ex Exception) {
            logger.LogWarning(ex, "Could not clear active-jobs state file '{Path}'.", path!!)
        }
    }

    private func PersistActiveJobs() {
        let path = options.ActiveJobsStatePath
        if string.IsNullOrEmpty(path) {
            return
        }
        try {
            let snapshot = jobs.Select(
                (kv KeyValuePair[string, JobLifecycle]) -> PersistedJob{
                    Id: kv.Value.Request.Id,
                    Asin: kv.Value.Request.Asin,
                    Title: kv.Value.Request.Title,
                    StartedAt: kv.Value.StartedAt,
                    ProfileAlias: kv.Value.Request.ProfileAlias,
                    Quality: kv.Value.Request.Quality,
                    LastPhase: kv.Value.LastPhase
                }
            )
                .ToList()
            AtomicFile.WriteAllJson(path, snapshot)
        } catch (ex Exception) {
            // Persistence is best-effort: never let a state-file IO failure
            // bring down the scheduler thread.
            logger.LogWarning(ex, "Could not persist active-jobs state file '{Path}'.", path)
        }
    }

    private class PersistedJob {
        private var _id string = string.Empty

        prop Id string {
            get {
                return _id
            }
            set {
                _id = value
            }
        }

        private var _asin string = string.Empty

        prop Asin string {
            get {
                return _asin
            }
            set {
                _asin = value
            }
        }

        prop Title string?
        prop StartedAt DateTimeOffset
        prop ProfileAlias string?
        prop Quality DownloadQuality
        prop LastPhase JobPhase
    }

    private class JobLifecycle {
        init(request JobRequest, startedAt DateTimeOffset) {
            Cts = CancellationTokenSource()
            Request = request
            StartedAt = startedAt
            LastUpdatedAt = startedAt
            LastPhase = JobPhase.Queued
        }

        prop Request JobRequest {
            get;
            init;
        }

        prop StartedAt DateTimeOffset {
            get;
            init;
        }

        prop Cts CancellationTokenSource {
            get;
            init;
        }

        prop LastPhase JobPhase
        prop LastProgress float64?
        prop LastMessage string?
        prop LastUpdatedAt DateTimeOffset
    }

    shared {
        private func Snapshot(lc JobLifecycle) JobSnapshot -> JobSnapshot{
            JobId: lc.Request.Id,
            Asin: lc.Request.Asin,
            Title: lc.Request.Title,
            Phase: lc.LastPhase,
            Progress: lc.LastProgress,
            Message: lc.LastMessage,
            StartedAt: lc.StartedAt,
            UpdatedAt: lc.LastUpdatedAt,
            Quality: lc.Request.Quality,
            ProfileAlias: lc.Request.ProfileAlias
        }

        private func IsTerminal(p JobPhase) bool -> p == JobPhase.Completed ||
            p == JobPhase.Failed ||
            p == JobPhase.Canceled

        private async func EmptyHistory(@EnumeratorCancellation cancellationToken CancellationToken) IAsyncEnumerable[
            JobRecord
        ] {
            await Task.CompletedTask.ConfigureAwait(false)
            yield break
        }
    }
}
