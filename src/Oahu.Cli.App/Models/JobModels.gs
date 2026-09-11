package Oahu.Cli.App.Models

import System

/// Coarse-grained job phase; finer per-phase progress lives in (cref:JobUpdate).
enum JobPhase {
    Queued,
    Licensing,
    Downloading,
    Decrypting,
    Exporting,
    Completed,
    Failed,
    Canceled
}

/// A unit of work submitted to `IJobService`.
data class JobRequest {
    prop Asin string {
        get;
        init;
    }

    prop Title string {
        get;
        init;
    }

    private var _quality DownloadQuality = DownloadQuality.High

    prop Quality DownloadQuality {
        get {
            return _quality
        }
        init {
            _quality = value
        }
    }

    prop ProfileAlias string? {
        get;
        init;
    }

    /// When true, run the AAX exporter ("Exporting" phase) after decrypt.
    prop ExportToAax bool {
        get;
        init;
    }

    /// When true, also produce a `.m4b` file via the same exporter. May be
    /// combined with (cref:ExportToAax) ("both" mode) — design §4.1.
    prop ExportToM4b bool {
        get;
        init;
    }

    /// When true, stop after the LocalLocked phase: the encrypted `.aax(c)`
    /// file is left on disk and no decryption is performed. Useful for offline
    /// archival or manual conversion. Implies (cref:ExportToAax) /
    /// (cref:ExportToM4b) are ignored.
    prop NoDecrypt bool {
        get;
        init;
    }

    /// Optional override for the export directory (only meaningful when (cref:ExportToAax)).
    prop OutputDir string? {
        get;
        init;
    }

    /// Stable identifier for cross-invocation tracking (history.jsonl).
    private var _id string = Guid.NewGuid().ToString("n")

    prop Id string {
        get {
            return _id
        }
        init {
            _id = value
        }
    }
}

/// A single observation emitted while a job runs. Streamed via
/// (cref:System.Collections.Generic.IAsyncEnumerable{T}).
data class JobUpdate {
    prop JobId string {
        get;
        init;
    }

    prop Phase JobPhase {
        get;
        init;
    }

    /// Per-phase progress in [0, 1], or null if indeterminate.
    prop Progress float64? {
        get;
        init;
    }

    prop Message string? {
        get;
        init;
    }

    private var _timestamp DateTimeOffset = DateTimeOffset.UtcNow

    prop Timestamp DateTimeOffset {
        get {
            return _timestamp
        }
        init {
            _timestamp = value
        }
    }
}

/// Latest-known status of an in-flight job. Returned by `IJobService.GetSnapshotAsync` /
/// `ListActiveAsync` so HTTP/MCP clients can poll progress without missing the early
/// `Queued`/`Licensing` updates that may fire before they connect.
data class JobSnapshot {
    prop JobId string {
        get;
        init;
    }

    prop Asin string {
        get;
        init;
    }

    prop Title string {
        get;
        init;
    }

    prop Phase JobPhase {
        get;
        init;
    }

    prop Progress float64? {
        get;
        init;
    }

    prop Message string? {
        get;
        init;
    }

    prop StartedAt DateTimeOffset {
        get;
        init;
    }

    /// Timestamp of the most recent (cref:JobUpdate) applied to this snapshot.
    prop UpdatedAt DateTimeOffset {
        get;
        init;
    }

    prop Quality DownloadQuality? {
        get;
        init;
    }

    prop ProfileAlias string? {
        get;
        init;
    }
}

/// Snapshot persisted to `history.jsonl` when a job leaves a terminal state.
data class JobRecord {
    prop Id string {
        get;
        init;
    }

    prop Asin string {
        get;
        init;
    }

    prop Title string {
        get;
        init;
    }

    prop TerminalPhase JobPhase {
        get;
        init;
    }

    prop StartedAt DateTimeOffset {
        get;
        init;
    }

    prop CompletedAt DateTimeOffset {
        get;
        init;
    }

    prop ErrorMessage string? {
        get;
        init;
    }

    prop ProfileAlias string? {
        get;
        init;
    }

    /// Quality requested when the job was submitted. Optional for backwards
    /// compatibility with records produced before phase 4c.2: a missing
    /// value means "use the current default" on retry.
    prop Quality DownloadQuality? {
        get;
        init;
    }
}
