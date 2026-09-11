package Oahu.Core.UI.Avalonia.ViewModels

import CommunityToolkit.Mvvm.ComponentModel
import CommunityToolkit.Mvvm.Input
import Oahu.Aux.Extensions
import Oahu.Core
import System
import System.Threading.Tasks

partial class SettingsViewModel : ObservableObject {
    private let downloadSettings DownloadSettings
    private let exportSettings ExportSettings
    private let configSettings ConfigSettings

    init(downloadSettings DownloadSettings, exportSettings ExportSettings, configSettings ConfigSettings) {
        this.downloadSettings = downloadSettings
        this.exportSettings = exportSettings
        this.configSettings = configSettings
    }

    /// Event raised when the user wants to browse for a folder.
    /// The view code-behind handles the native folder picker and returns the selected path.
    event BrowseFolderRequested Func[string, Task[string]]

    // Download settings
    prop AutoUpdateLibrary bool {
        get -> downloadSettings.AutoUpdateLibrary
        set {
            this.downloadSettings.AutoUpdateLibrary = value
            OnPropertyChanged()
            downloadSettings.OnChange()
        }
    }

    prop MultiPartDownload bool {
        get -> downloadSettings.MultiPartDownload
        set {
            this.downloadSettings.MultiPartDownload = value
            OnPropertyChanged()
            downloadSettings.OnChange()
        }
    }

    prop KeepEncryptedFiles bool {
        get -> downloadSettings.KeepEncryptedFiles
        set {
            this.downloadSettings.KeepEncryptedFiles = value
            OnPropertyChanged()
            downloadSettings.OnChange()
        }
    }

    prop DownloadDirectory string {
        get -> downloadSettings.DownloadDirectory
        set {
            this.downloadSettings.DownloadDirectory = value
            OnPropertyChanged()
            downloadSettings.OnChange()
        }
    }

    // Export settings
    prop ExportToAax bool? {
        get -> exportSettings.ExportToAax
        set {
            this.exportSettings.ExportToAax = value
            OnPropertyChanged()
            exportSettings.OnChange()
        }
    }

    prop ExportDirectory string {
        get -> exportSettings.ExportDirectory
        set {
            this.exportSettings.ExportDirectory = value
            OnPropertyChanged()
            exportSettings.OnChange()
        }
    }

    // Config settings
    prop EncryptConfiguration bool {
        get -> configSettings.EncryptConfiguration
        set {
            this.configSettings.EncryptConfiguration = value
            OnPropertyChanged()
            configSettings.OnChange()
        }
    }

    @RelayCommand
    private async func BrowseDownloadDirectory() {
        if BrowseFolderRequested != nil {
            let path = await BrowseFolderRequested("Select Download Folder")
            if !path.IsNullOrWhiteSpace() {
                DownloadDirectory = path
            }
        }
    }

    @RelayCommand
    private async func BrowseExportDirectory() {
        if BrowseFolderRequested != nil {
            let path = await BrowseFolderRequested("Select Export Folder")
            if !path.IsNullOrWhiteSpace() {
                ExportDirectory = path
            }
        }
    }
}
