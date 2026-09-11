package Oahu.Cli.App.Queue

import Oahu.Cli.App.Models
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

/// The user-visible pending queue. Persists across CLI invocations.
interface IQueueService {
    func ListAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[IReadOnlyList[QueueEntry]];

    /// Adds an entry, returning `true` if it was new and `false` if a same-ASIN entry already existed.
    func AddAsync(entry QueueEntry, cancellationToken CancellationToken = default(CancellationToken)) Task[bool];

    func RemoveAsync(asin string, cancellationToken CancellationToken = default(CancellationToken)) Task[bool];

    /// Atomically swap the entry identified by [`asin`](paramref) with the entry
    /// at offset [`delta`](paramref) from its current position (e.g. -1 = up,
    /// +1 = down). No-op (returns false) if the entry doesn't exist or the move would
    /// fall off either end of the list. Other entries are preserved exactly,
    /// including their `AddedAt` timestamps.
    func MoveAsync(asin string, delta int32, cancellationToken CancellationToken = default(CancellationToken)) Task[
        bool
    ];

    func ClearAsync(cancellationToken CancellationToken = default(CancellationToken)) Task;
}
