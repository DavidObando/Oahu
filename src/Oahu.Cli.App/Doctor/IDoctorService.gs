package Oahu.Cli.App.Doctor

import System.Threading
import System.Threading.Tasks

/// Runs environment self-checks (write perms, profile store readable, library cache
/// reachable, Audible API reachable, disk free).
///
/// Per design (§15 risks), there is intentionally <b>no FFmpeg check</b>: decryption
/// and muxing are fully in-process via `Oahu.Decrypt` (AAXClean-derived).
interface IDoctorService {
    func RunAsync(options DoctorOptions? = nil, ct CancellationToken = default(CancellationToken)) Task[DoctorReport];
}

/// Tunables for (cref:IDoctorService.RunAsync).
class DoctorOptions {
    init() {
        MinFreeBytes = 1L * int64(1024) * int64(1024) * int64(1024)
    }

    /// Override the directory checked for write permissions (defaults to
    /// (cref:Paths.CliPaths.DefaultDownloadDir)).
    prop OutputDir string? {
        get;
        init;
    }

    /// Skip the network check (offline environments / CI).
    prop SkipNetwork bool {
        get;
        init;
    }

    /// Minimum free disk space considered acceptable (default 1 GiB).
    prop MinFreeBytes int64 {
        get;
        init;
    }
}
