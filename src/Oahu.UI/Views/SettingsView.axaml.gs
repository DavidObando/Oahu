package Oahu.Core.UI.Avalonia.Views

import Avalonia.Controls
import Avalonia.Interactivity
import Avalonia.Platform.Storage
import Oahu.Core.UI.Avalonia.ViewModels
import System.Threading.Tasks

open partial class SettingsView : UserControl {
    init() {
        InitializeComponent()
    }

    protected open override func OnLoaded(e RoutedEventArgs) {
        base.OnLoaded(e)
        if DataContext is SettingsViewModel vm {
            vm.BrowseFolderRequested += BrowseFolderAsync
        }
    }

    protected open override func OnUnloaded(e RoutedEventArgs) {
        if DataContext is SettingsViewModel vm {
            vm.BrowseFolderRequested -= BrowseFolderAsync
        }
        base.OnUnloaded(e)
    }

    private async func BrowseFolderAsync(title string) string? {
        let topLevel TopLevel? = TopLevel.GetTopLevel(this)
        if topLevel == nil {
            return nil
        }
        let folders = await topLevel.StorageProvider.OpenFolderPickerAsync(
            FolderPickerOpenOptions{Title: title, AllowMultiple: false}
        )
        if folders.Count > 0 {
            return folders[0].Path.LocalPath
        }
        return nil
    }
}
