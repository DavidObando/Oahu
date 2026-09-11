package Oahu.Cli.App.Models

import Oahu.Cli.App.Paths
import System.Collections.Generic
import System.IO
import System.Text.Json
import System.Text.Json.Serialization

/// User-tunable settings for the CLI. Loaded from / saved to `config.json` via
/// `IConfigService`. New fields must default to sensible values so the file
/// stays forward-compatible without a migration.
data class OahuConfig {
    private var _downloadDirectory string = CliPaths.DefaultDownloadDir

    prop DownloadDirectory string {
        get {
            return _downloadDirectory
        }
        init {
            _downloadDirectory = value
        }
    }

    private var _defaultQuality DownloadQuality = DownloadQuality.High

    prop DefaultQuality DownloadQuality {
        get {
            return _defaultQuality
        }
        init {
            _defaultQuality = value
        }
    }

    private var _maxParallelJobs int32 = 1

    prop MaxParallelJobs int32 {
        get {
            return _maxParallelJobs
        }
        init {
            _maxParallelJobs = value
        }
    }

    prop KeepEncryptedFiles bool {
        get;
        init;
    }

    prop MultiPartDownload bool {
        get;
        init;
    }

    prop ExportToAax bool {
        get;
        init;
    }

    private var _exportDirectory string = ""

    prop ExportDirectory string {
        get {
            return _exportDirectory
        }
        init {
            _exportDirectory = value
        }
    }

    prop DefaultProfileAlias string? {
        get;
        init;
    }

    /// Name of the active TUI theme (case-insensitive). Null/empty means "use the built-in
    /// default". Validated against `Oahu.Cli.Tui.Themes.Theme.AvailableNames()` when set
    /// via `oahu-cli config set theme`; the TUI silently falls back to the default if
    /// the persisted value is unknown so a stale config never wedges startup.
    prop Theme string? {
        get;
        init;
    }

    /// When true, the credentials store falls back to a passphrase-protected file when no native keyring is
    /// available.
    /// Off by default — the design's stance is "fail closed" rather than silently store secrets in a file.
    prop AllowEncryptedFileCredentials bool {
        get;
        init;
    }

    /// Captures any JSON properties that were present on disk but are not declared above.
    /// Preserved across round-trips so a newer CLI can write fields that an older CLI will not erase.
    @JsonExtensionData
    prop ExtraProperties Dictionary[string, JsonElement]? {
        get;
        init;
    }

    shared {
        /// Default config used the first time the CLI runs (no file on disk yet).
        prop Default OahuConfig -> OahuConfig()
    }
}
