package Oahu.App.Avalonia

import Oahu.Aux
import Oahu.Core
import System

class UserSettings : IUserSettings, IInitSettings {
    private var _downloadSettings DownloadSettings? = DownloadSettings()

    prop DownloadSettings DownloadSettings? {
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

    private var _exportSettings ExportSettings? = ExportSettings()

    prop ExportSettings ExportSettings? {
        get {
            return _exportSettings
        }
        set {
            _exportSettings = value
        }
    }

    func Init() {
        SettingsDefaults.ApplyDefaults(DownloadSettings, ExportSettings)
        this.DownloadSettings!!.ChangedSettings += OnChangedSettings
        this.ConfigSettings.ChangedSettings += OnChangedSettings
        this.ExportSettings!!.ChangedSettings += OnChangedSettings
    }

    private func OnChangedSettings(sender object, e EventArgs) -> this.Save()
}
