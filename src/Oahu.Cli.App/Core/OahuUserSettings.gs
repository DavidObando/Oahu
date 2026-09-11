package Oahu.Cli.App.Core

import Oahu.Aux
import Oahu.Core
import System

/// CLI-side mirror of the Avalonia GUI's `UserSettings` shape. Both classes
/// serialize to/from the same `usersettings.json` file under the shared
/// application-data root (see (cref:CoreEnvironment.DefaultSharedApplName)),
/// so the CLI honours (cref:ConfigSettings)/(cref:DownloadSettings)/
/// (cref:ExportSettings) changes made through the GUI and vice-versa.
/// @remarks We mirror the type rather than reference `Oahu.App.Avalonia.UserSettings`
/// to avoid pulling Avalonia into the CLI. (cref:SettingsManager)'s
/// JSON-driven hydration only cares about the property shape.
class OahuUserSettings : IUserSettings, IInitSettings {
    private var _downloadSettings DownloadSettings = DownloadSettings()

    prop DownloadSettings DownloadSettings {
        get {
            return _downloadSettings
        }
        set {
            _downloadSettings = value
        }
    }

    private var _configSettings ConfigSettings = ConfigSettings()

    prop ConfigSettings ConfigSettings {
        get {
            return _configSettings
        }
        set {
            _configSettings = value
        }
    }

    private var _exportSettings ExportSettings = ExportSettings()

    prop ExportSettings ExportSettings {
        get {
            return _exportSettings
        }
        set {
            _exportSettings = value
        }
    }

    func Init() {
        // Apply shared defaults (DownloadDirectory, etc.) before subscribing
        // to change events so the autosave hook doesn't fire while we are
        // still hydrating. Centralised in Oahu.Core so the GUI and CLI agree
        // on what a freshly-loaded usersettings.json looks like — without it,
        // signing in via the CLI on a fresh install left DownloadDirectory
        // null and the next download attempt threw inside
        // Directory.CreateDirectory.
        SettingsDefaults.ApplyDefaults(DownloadSettings, ExportSettings)
        this.DownloadSettings.ChangedSettings += OnChangedSettings
        this.ConfigSettings.ChangedSettings += OnChangedSettings
        this.ExportSettings.ChangedSettings += OnChangedSettings
    }

    private func OnChangedSettings(sender object?, e EventArgs) -> this.Save()
}
