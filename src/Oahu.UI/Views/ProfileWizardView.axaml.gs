package Oahu.Core.UI.Avalonia.Views

import Avalonia.Controls
import Avalonia.Interactivity
import Avalonia.Platform.Storage
import Oahu.Core.UI.Avalonia.ViewModels
import System.Threading.Tasks

open partial class ProfileWizardView : UserControl {
    init() {
        InitializeComponent()
    }

    protected open override func OnLoaded(e RoutedEventArgs) {
        base.OnLoaded(e)
        if DataContext is ProfileWizardViewModel vm {
            // Hook clipboard copy for login URL
            let btn Button? = this.FindControl[Button]("btnCopyUrl")
            if btn != nil {
                btn.Click += async func (s object?, args RoutedEventArgs) void {
                    let topLevel TopLevel? = TopLevel.GetTopLevel(this)
                    if topLevel?.Clipboard != nil && !string.IsNullOrEmpty(vm.LoginUrl) {
                        await topLevel!!.Clipboard!!.SetTextAsync(vm.LoginUrl)
                    }
                }
            }
            // Wire folder picker for download directory
            vm.BrowseDownloadDirectoryRequested += () -> BrowseFolderAsync("Select Download Folder")
            // Wire folder picker for export directory
            vm.BrowseExportDirectoryRequested += () -> BrowseFolderAsync("Select Export Folder")
        }
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
