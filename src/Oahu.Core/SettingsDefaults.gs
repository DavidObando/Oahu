package Oahu.Core

import System
import System.IO

/// Shared defaults for the user-facing (cref:DownloadSettings) and
/// (cref:ExportSettings). Both the Avalonia GUI and the CLI rely on
/// these so that a freshly created `usersettings.json` behaves the same
/// regardless of which surface bootstraps it first.
///
/// Historically, `Oahu.App.Avalonia.UserSettings.Init` was the only
/// place that defaulted (cref:DownloadSettings.DownloadDirectory).
/// That meant signing in via `oahu-cli` on a fresh install left
/// `DownloadDirectory` null and the very next download attempt failed
/// with a (cref:ArgumentNullException) from
/// (cref:Directory.CreateDirectory(string)). Centralizing the logic
/// here removes the asymmetry.
class SettingsDefaults {
    shared {
        /// `~/Music/Oahu/Downloads` on every platform — matches the path the
        /// Avalonia GUI has historically used so the two surfaces share one
        /// download root.
        private let _defaultDownloadDirectory string = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "Music",
            "Oahu",
            "Downloads"
        )

        prop DefaultDownloadDirectory string {
            get {
                return _defaultDownloadDirectory
            }
        }

        /// Apply defaults for any settings that are unset on a freshly loaded
        /// `usersettings.json`. Idempotent — pre-populated values are
        /// preserved. Both (cref:Oahu.App.Avalonia.UserSettings.Init) (GUI)
        /// and the CLI's `OahuUserSettings.Init` call this so that downloads
        /// have a sane target directory regardless of which surface registered the
        /// profile.
        /// @param downloadSettings The mutable (cref:DownloadSettings) instance loaded from disk
        /// (or freshly constructed). Required.
        /// @param exportSettings The mutable (cref:ExportSettings) instance. Currently no
        /// defaults are forced here — (cref:ExportSettings.ExportDirectory)
        /// remains opt-in until the user enables `ExportToAax` — but we
        /// thread it through so future defaults can land in one place.
        func ApplyDefaults(downloadSettings DownloadSettings?, exportSettings ExportSettings) {
            if downloadSettings == nil {
                throw ArgumentNullException("downloadSettings")
            }
            if string.IsNullOrWhiteSpace(downloadSettings.DownloadDirectory) {
                downloadSettings.DownloadDirectory = DefaultDownloadDirectory
            }
        }
    }
}
