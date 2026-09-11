package Oahu.Cli.Tui.Shell

import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Queue
import Oahu.Cli.Tui.Logging
import System
import System.Collections.Generic

/// Configuration knobs for (cref:AppShell).
class AppShellOptions {
    init() {
        Profile = string.Empty
        Region = string.Empty
        Version = string.Empty
    }

    /// Force ASCII glyphs / borders. Honoured when `OAHU_ASCII_ICONS=1` or `--ascii`.
    prop UseAscii bool {
        get;
        init;
    }

    /// Optional ring-buffer logger that feeds the Logs overlay (toggled with `L`).
    prop LogBuffer LogRingBuffer? {
        get;
        init;
    }

    /// Display profile / region in the header. Empty = "not signed in".
    prop Profile string {
        get;
        init;
    }

    prop Region string {
        get;
        init;
    }

    /// Version string shown on the right side of the header.
    prop Version string {
        get;
        init;
    }

    /// Custom tab list. Defaults to the six placeholder screens
    /// ((cref:DefaultTabs)) when null.
    prop Tabs IReadOnlyList[ITabScreen]? {
        get;
        init;
    }

    /// Synthesised activity verb shown in the header (e.g. "idle", "syncing library…").
    prop ActivityVerb(() -> string)? {
        get;
        init;
    }

    /// Mutable runtime state. When set, the header reads profile/region/activity
    /// from this instead of the init-only properties. Phase 7+.
    prop State AppShellState? {
        get;
        init;
    }

    /// Resolver for the persistent download queue. Phase 8+.
    prop QueueServiceFactory(() -> IQueueService)? {
        get;
        init;
    }

    /// Resolver for the job scheduler. Phase 8+.
    prop JobServiceFactory(() -> IJobService)? {
        get;
        init;
    }
}
