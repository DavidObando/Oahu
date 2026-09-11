package Oahu.Cli.App.Core

import Oahu.Aux
import Oahu.BooksDatabase
import Oahu.CommonTypes
import Oahu.Core
import Oahu.SystemManagement
import System
import System.Threading.Tasks
import SystemObject = System.Object

/// Process-wide bootstrap for the Core-backed CLI services. Owns the long-lived
/// (cref:AudibleClient) singleton and the path-sharing override that
/// makes the CLI read/write the same data root as the Avalonia GUI
/// (`~/Library/Application Support/Oahu/...` on macOS, equivalent on
/// Linux/Windows).
///
/// Lifetime model:
/// - (cref:Initialize) must run before any code path constructs an (cref:AudibleClient), opens the
/// books DB, or otherwise touches (cref:ApplEnv.LocalApplDirectory). It is idempotent.
/// - (cref:InitializeDatabaseAsync) applies pending EF Core migrations (idempotent; safe to call before
/// every command).
/// - (cref:Client) returns the singleton (cref:AudibleClient). The CLI process never disposes it;
/// Core's `ConfigSettings.ChangedSettings` subscription would otherwise leak across re-creations and
/// the process exits soon enough.
/// The shared application-data folder name is configurable so tests can route
/// to an isolated temp directory; the production CLI uses
/// (cref:DefaultSharedApplName) to coexist with the Avalonia GUI.
class CoreEnvironment {
    shared {
        /// The Avalonia GUI's (cref:ApplEnv.ApplName).
        const DefaultSharedApplName string = "Oahu"

        private let Lock object = SystemObject()
        private var initialized bool
        private var client AudibleClient?
        private var settings OahuUserSettings?
        private var hardwareIdProvider IHardwareIdProvider?

        /// Initialize the shared environment. Routes (cref:ApplEnv) paths to
        /// the GUI-shared root and selects a hardware-id provider for the host OS.
        /// Subsequent calls with the same [`applName`](paramref) are no-ops;
        /// calls with a different name throw so we do not silently re-route
        /// mid-process.
        func Initialize(applName string = "Oahu") {
            ArgumentException.ThrowIfNullOrWhiteSpace(applName)
            lock Lock {
                if initialized {
                    if !string.Equals(ApplEnv.ApplName, applName, StringComparison.Ordinal) {
                        throw InvalidOperationException(
                            "CoreEnvironment already initialized with ApplName='${ApplEnv.ApplName}'; cannot re-initialize as '$applName'."
                        )
                    }
                    return
                }
                ApplEnv.OverrideApplName(applName)
                hardwareIdProvider = SelectHardwareIdProvider()
                initialized = true
            }
        }

        /// Initialize the books database (apply pending migrations). Idempotent and
        /// fast when migrations are already applied. Returns `true`
        /// when the database is reachable afterwards.
        func InitializeDatabaseAsync() Task[bool] {
            EnsureInitialized()
            return BookDbContextLazyLoad.StartupAsync()!!
        }

        /// Returns the long-lived (cref:AudibleClient) singleton. Lazily
        /// constructs it from the GUI-shared `usersettings.json` on first
        /// access and runs (cref:BookDbContextLazyLoad.StartupAsync) once
        /// to apply any pending EF Core migrations. Never disposed
        /// (process-lifetime).
        prop Client AudibleClient {
            get {
                EnsureInitialized()
                lock Lock {
                    if client != nil {
                        return client!!
                    }
                    // One-shot DB migration before we open the BookLibrary used by
                    // AudibleClient. .GetAwaiter().GetResult() is safe here: this
                    // path is called from the CLI main thread (no sync context) or
                    // from tests on the thread pool, never from a UI dispatcher.
                    BookDbContextLazyLoad.StartupAsync()!!.GetAwaiter().GetResult()
                    settings = SettingsManager.GetUserSettings[OahuUserSettings]()
                    // dbDir = null => AudibleClient/BookLibrary/BookDbContext use
                    // ApplEnv.LocalApplDirectory derivatives (now routed to the
                    // shared "Oahu" root via the OverrideApplName above).
                    client = AudibleClient(settings!!.ConfigSettings, settings!!.DownloadSettings, hardwareIdProvider!!)
                    return client!!
                }
            }
        }

        /// Returns the long-lived (cref:OahuUserSettings) singleton (loaded
        /// from the GUI-shared `usersettings.json`). Triggers initialization
        /// of (cref:Client) on first access so the settings file is
        /// hydrated. Used by the job pipeline (`AudibleJobExecutor`) to read
        /// (cref:OahuUserSettings.DownloadSettings) and
        /// (cref:OahuUserSettings.ExportSettings).
        prop Settings OahuUserSettings {
            get {
                let _ = Client // forces lazy load.
                return settings!!
            }
        }

        /// If (cref:AudibleClient.ProfileKey) is null, attempts to load the
        /// "active" profile recorded by the GUI in
        /// `UserSettings.DownloadSettings.Profile`. Returns `true`
        /// when a profile is loaded after this call. Idempotent — safe to call
        /// before every command that needs (cref:AudibleClient.Api).
        async func EnsureProfileLoadedAsync() bool {
            let c = Client // also triggers DB init + settings load
            if c.ProfileKey != nil {
                return true
            }
            let aliasKey ProfileAliasKey? = settings?.DownloadSettings?.Profile
            if aliasKey == nil || string.IsNullOrWhiteSpace(aliasKey.AccountAlias) {
                return false
            }
            // The GUI prompts for a new alias when there is none; the CLI is
            // non-interactive in this path, so accept whatever the DB has by
            // returning true (i.e. "use any cached alias").
            let loaded IProfileAliasKey? = await c.ConfigFromFileAsync(
                aliasKey,
                (_ AccountAliasContext) -> true
            )!!.ConfigureAwait(false)
            return loaded != nil
        }

        /// Test hook: drop singletons so the next access reconstructs them. Does
        /// NOT undo (cref:ApplEnv.OverrideApplName) — once set, the path
        /// override persists for the process. Tests that need a different shared
        /// root must orchestrate that via (cref:Initialize) in a fresh
        /// process.
        func ResetForTests() {
            lock Lock {
                client = nil
                settings = nil
            }
        }

        private func EnsureInitialized() {
            if !initialized {
                throw InvalidOperationException(
                    "${"CoreEnvironment"}.${"Initialize"}() must be called before any other CoreEnvironment member."
                )
            }
        }

        private func SelectHardwareIdProvider() IHardwareIdProvider {
            if OperatingSystem.IsWindows() {
                return WinHardwareIdProvider()
            }
            if OperatingSystem.IsMacOS() {
                return MacHardwareIdProvider()
            }
            if OperatingSystem.IsLinux() {
                return LinuxHardwareIdProvider()
            }
            throw PlatformNotSupportedException(
                "oahu-cli requires Windows, macOS, or Linux for hardware-id derivation."
            )
        }
    }
}
