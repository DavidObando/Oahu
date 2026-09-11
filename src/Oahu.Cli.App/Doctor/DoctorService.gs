package Oahu.Cli.App.Doctor

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Aux
import Oahu.Cli.App.Core
import Oahu.Cli.App.Paths
import System
import System.Collections.Generic
import System.IO
import System.Net.Http
import System.Threading
import System.Threading.Tasks

/// Default (cref:IDoctorService) implementation.
///
/// Each check returns a (cref:DoctorCheck); failures degrade to a single
/// (cref:DoctorSeverity) entry rather than throwing, so `oahu-cli doctor`
/// can still print a complete report even when one probe fails.
class DoctorService : IDoctorService {
    private let logger ILogger[DoctorService]
    private let httpClientFactory() -> HttpClient

    init(logger ILogger[DoctorService]? = nil, httpClientFactory(() -> HttpClient)? = nil) {
        this.logger = logger ?? NullLogger[DoctorService].Instance
        this.httpClientFactory = httpClientFactory ?? DefaultHttpClient
    }

    async func RunAsync(options DoctorOptions? = nil, ct CancellationToken = default(CancellationToken)) DoctorReport {
        var options = options
        options ??= DoctorOptions()
        let checks = List[DoctorCheck]{
            CheckOutputDirectoryWritable(options!!.OutputDir ?? CliPaths.DefaultDownloadDir),
            CheckSharedUserDataDirReadable(),
            CheckLibraryCacheReachable(),
            CheckDiskFree(options!!.OutputDir ?? CliPaths.DefaultDownloadDir, options!!.MinFreeBytes),
            CheckCliConfigWritable(),
            CheckUserSettings()
        }
        if options!!.SkipNetwork {
            checks.Add(
                DoctorCheck("audible-api", "Audible API reachable", DoctorSeverity.Ok, "skipped (--skip-network)")
            )
        } else {
            checks.Add(await CheckAudibleApiReachableAsync(ct).ConfigureAwait(false))
        }
        return DoctorReport(checks)
    }

    async func CheckAudibleApiReachableAsync(ct CancellationToken) DoctorCheck {
        try {
            using let http = httpClientFactory()
            using let req = HttpRequestMessage(HttpMethod.Head, AudibleProbeUri)
            using let cts = CancellationTokenSource.CreateLinkedTokenSource(ct)
            cts.CancelAfter(TimeSpan.FromSeconds(5))
            using let resp = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cts.Token)
                .ConfigureAwait(false)
            // Audible may answer with 4xx for an unauthenticated bare-root request — that's still "reachable".
            return DoctorCheck(
                "audible-api",
                "Audible API reachable",
                DoctorSeverity.Ok,
                "HTTP ${int32(resp.StatusCode)} from ${AudibleProbeUri.Host}"
            )
        } catch (OperationCanceledException) when !ct.IsCancellationRequested {
            return DoctorCheck(
                "audible-api",
                "Audible API reachable",
                DoctorSeverity.Warning,
                "timed out after 5 s",
                "Check your network connection or proxy settings."
            )
        } catch (ex Exception) {
            logger.LogDebug(ex, "Audible API probe failed")
            return DoctorCheck(
                "audible-api",
                "Audible API reachable",
                DoctorSeverity.Warning,
                ex.Message,
                "Check your network connection or proxy settings."
            )
        }
    }

    shared {
        private let AudibleProbeUri Uri = Uri("https://api.audible.com/", UriKind.Absolute)

        func CheckOutputDirectoryWritable(path string) DoctorCheck {
            try {
                Directory.CreateDirectory(path)
                let probe = Path.Combine(path, ".oahu-cli-doctor-${Guid.NewGuid():N}")
                File.WriteAllText(probe, string.Empty)
                File.Delete(probe)
                return DoctorCheck("output-dir", "Output directory writable", DoctorSeverity.Ok, path)
            } catch (ex Exception) {
                return DoctorCheck(
                    "output-dir",
                    "Output directory writable",
                    DoctorSeverity.Error,
                    "$path: ${ex.Message}",
                    "Pick a writable directory with `oahu-cli config set output-dir <path>` or pass `--output-dir`."
                )
            }
        }

        func CheckSharedUserDataDirReadable() DoctorCheck {
            let dir = CliPaths.SharedUserDataDir
            try {
                // Existence is informational only — a fresh install will not have created it yet.
                // The check passes as long as we can stat the parent.
                let parent = Directory.GetParent(dir)?.FullName ?? dir
                if !Directory.Exists(parent) {
                    return DoctorCheck(
                        "user-data-dir",
                        "Shared user-data directory accessible",
                        DoctorSeverity.Warning,
                        "parent does not exist: $parent",
                        "The Oahu GUI creates this on first run; install or run the GUI once, or `oahu-cli auth login` will create it."
                    )
                }
                return DoctorCheck(
                    "user-data-dir",
                    "Shared user-data directory accessible",
                    DoctorSeverity.Ok,
                    if Directory.Exists(dir) {
                        dir
                    } else {
                        "will be created at: $dir"
                    }
                )
            } catch (ex Exception) {
                return DoctorCheck(
                    "user-data-dir",
                    "Shared user-data directory accessible",
                    DoctorSeverity.Error,
                    ex.Message
                )
            }
        }

        func CheckLibraryCacheReachable() DoctorCheck {
            // The library cache lives under <SharedUserDataDir>/data/audiobooks.db (see Oahu.Data.BookDbContext).
            // We don't open EF here (that would require a profile); we just check the file's directory is reachable.
            let dataDir = Path.Combine(CliPaths.SharedUserDataDir, "data")
            try {
                if !Directory.Exists(dataDir) {
                    return DoctorCheck(
                        "library-cache",
                        "Library cache directory reachable",
                        DoctorSeverity.Warning,
                        "not yet created: $dataDir",
                        "Created on first sign-in / library sync."
                    )
                }
                let dbFile = Path.Combine(dataDir, "audiobooks.db")
                let status = if File.Exists(dbFile) {
                    "present: $dbFile"
                } else {
                    "will be created at: $dbFile"
                }
                return DoctorCheck("library-cache", "Library cache directory reachable", DoctorSeverity.Ok, status)
            } catch (ex Exception) {
                return DoctorCheck(
                    "library-cache",
                    "Library cache directory reachable",
                    DoctorSeverity.Error,
                    ex.Message
                )
            }
        }

        func CheckCliConfigWritable() DoctorCheck {
            try {
                CliPaths.EnsureDirectories()
                let probe = Path.Combine(CliPaths.ConfigDir, ".oahu-cli-doctor-${Guid.NewGuid():N}")
                File.WriteAllText(probe, string.Empty)
                File.Delete(probe)
                return DoctorCheck("cli-config", "CLI config directory writable", DoctorSeverity.Ok, CliPaths.ConfigDir)
            } catch (ex Exception) {
                return DoctorCheck(
                    "cli-config",
                    "CLI config directory writable",
                    DoctorSeverity.Error,
                    "${CliPaths.ConfigDir}: ${ex.Message}"
                )
            }
        }

        /// Verify the GUI-shared `usersettings.json` has the directories
        /// downloads / exports actually need at runtime. The defaults are applied
        /// inside (cref:Oahu.Core.SettingsDefaults.ApplyDefaults) when
        /// `OahuUserSettings.Init` runs, so a fresh install passes; this
        /// check is the safety net that catches a user-edited config that left
        /// `DownloadDirectory` blank or pointed at an unwritable path, or
        /// turned on `ExportToAax` without setting `ExportDirectory`.
        func CheckUserSettings() DoctorCheck {
            try {
                // CoreEnvironment.Initialize is invoked by Program.cs at every CLI
                // command's entry point (so doctor sees the GUI-shared paths). We
                // intentionally do NOT call it from here so unit tests can run
                // CheckUserSettings without mutating process-wide ApplEnv state.
                let settings = SettingsManager.GetUserSettings[OahuUserSettings]()
                let dl = settings.DownloadSettings
                let problems = List[string]()
                if string.IsNullOrWhiteSpace(dl.DownloadDirectory) {
                    problems.Add("DownloadDirectory is empty")
                } else if !CanWriteToDirectory(dl.DownloadDirectory, out var dlError) {
                    problems.Add("DownloadDirectory '${dl.DownloadDirectory}' is not writable: $dlError")
                }
                let ex = settings.ExportSettings
                // ExportDirectory only matters when the user opted in to AAX export.
                // Surfacing it as Error when ExportToAax is true and the directory
                // is invalid prevents a download from succeeding only to have the
                // export step blow up at the very end.
                if ex.ExportToAax == true {
                    if string.IsNullOrWhiteSpace(ex.ExportDirectory) {
                        problems.Add("ExportToAax is enabled but ExportDirectory is empty")
                    } else if !CanWriteToDirectory(ex.ExportDirectory, out var exError) {
                        problems.Add("ExportDirectory '${ex.ExportDirectory}' is not writable: $exError")
                    }
                }
                if problems.Count == 0 {
                    var summary = "download=${dl.DownloadDirectory}"
                    if ex.ExportToAax == true {
                        summary += "; export=${ex.ExportDirectory}"
                    }
                    return DoctorCheck("user-settings", "User settings populated and valid", DoctorSeverity.Ok, summary)
                }
                return DoctorCheck(
                    "user-settings",
                    "User settings populated and valid",
                    DoctorSeverity.Error,
                    string.Join("; ", problems),
                    "Adjust the affected paths in the GUI's Settings dialog or directly in usersettings.json under the shared data directory."
                )
            } catch (ex Exception) {
                return DoctorCheck(
                    "user-settings",
                    "User settings populated and valid",
                    DoctorSeverity.Warning,
                    "could not load usersettings.json: ${ex.Message}",
                    "Sign in once with `oahu-cli auth login` (or run the GUI) to materialize the settings file."
                )
            }
        }

        func CheckDiskFree(path string, minFreeBytes int64) DoctorCheck {
            try {
                // DriveInfo expects an existing path; walk up until we find one.
                var probe = path
                while !string.IsNullOrEmpty(probe) && !Directory.Exists(probe) {
                    probe = Path.GetDirectoryName(probe)!!
                }
                if string.IsNullOrEmpty(probe) {
                    probe = Path.GetPathRoot(Path.GetFullPath(path)) ?? "/"
                }
                let drive = DriveInfo(probe)
                let free = drive.AvailableFreeSpace
                let human = "${float64(free) / (1024.0 * float64(1024.0) * float64(1024.0)):0.00} GiB free on ${drive.Name}"
                if free < minFreeBytes {
                    return DoctorCheck(
                        "disk-free",
                        "Sufficient free disk space",
                        DoctorSeverity.Warning,
                        human,
                        "Audiobooks are large; aim for at least ${minFreeBytes / int64((1024 * 1024 * 1024))} GiB free on the output volume."
                    )
                }
                return DoctorCheck("disk-free", "Sufficient free disk space", DoctorSeverity.Ok, human)
            } catch (ex Exception) {
                return DoctorCheck("disk-free", "Sufficient free disk space", DoctorSeverity.Warning, ex.Message)
            }
        }

        private func DefaultHttpClient() HttpClient {
            let c = HttpClient{Timeout: TimeSpan.FromSeconds(10)}
            c.DefaultRequestHeaders.UserAgent.ParseAdd("oahu-cli/1.0 (+https://github.com/DavidObando/Oahu)")
            return c
        }

        private func CanWriteToDirectory(path string, out error string) bool {
            try {
                Directory.CreateDirectory(path)
                let probe = Path.Combine(path, ".oahu-cli-doctor-${Guid.NewGuid():N}")
                File.WriteAllText(probe, string.Empty)
                File.Delete(probe)
                error = string.Empty
                return true
            } catch (ex Exception) {
                error = ex.Message
                return false
            }
        }
    }
}
