package Oahu.Cli.App.Models

import System

/// One book waiting to be downloaded (or in flight). Lives in `queue.json`.
data class QueueEntry {
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

    private var _addedAt DateTimeOffset = DateTimeOffset.UtcNow

    prop AddedAt DateTimeOffset {
        get {
            return _addedAt
        }
        init {
            _addedAt = value
        }
    }

    /// Free-form profile alias the entry should be downloaded against (null = default profile).
    prop ProfileAlias string? {
        get;
        init;
    }
}
