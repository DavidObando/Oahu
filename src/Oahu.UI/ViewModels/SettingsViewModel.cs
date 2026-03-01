using System;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Oahu.Aux.Extensions;
using Oahu.Core;

namespace Oahu.Core.UI.Avalonia.ViewModels
{
  public partial class SettingsViewModel : ObservableObject
  {
    private readonly DownloadSettings downloadSettings;
    private readonly ExportSettings exportSettings;
    private readonly ConfigSettings configSettings;

    public SettingsViewModel(DownloadSettings downloadSettings, ExportSettings exportSettings, ConfigSettings configSettings)
    {
      this.downloadSettings = downloadSettings;
      this.exportSettings = exportSettings;
      this.configSettings = configSettings;
    }

    /// <summary>
    /// Event raised when the user wants to browse for a folder.
    /// The view code-behind handles the native folder picker and returns the selected path.
    /// </summary>
    public event Func<string, Task<string>> BrowseFolderRequested;

    // Download settings
    public bool AutoUpdateLibrary
    {
      get => downloadSettings.AutoUpdateLibrary;
      set
      {
        downloadSettings.AutoUpdateLibrary = value;
        OnPropertyChanged();
        downloadSettings.OnChange();
      }
    }

    public bool MultiPartDownload
    {
      get => downloadSettings.MultiPartDownload;
      set
      {
        downloadSettings.MultiPartDownload = value;
        OnPropertyChanged();
        downloadSettings.OnChange();
      }
    }

    public bool KeepEncryptedFiles
    {
      get => downloadSettings.KeepEncryptedFiles;
      set
      {
        downloadSettings.KeepEncryptedFiles = value;
        OnPropertyChanged();
        downloadSettings.OnChange();
      }
    }

    public string DownloadDirectory
    {
      get => downloadSettings.DownloadDirectory;
      set
      {
        downloadSettings.DownloadDirectory = value;
        OnPropertyChanged();
        downloadSettings.OnChange();
      }
    }

    // Export settings
    public bool? ExportToAax
    {
      get => exportSettings.ExportToAax;
      set
      {
        exportSettings.ExportToAax = value;
        OnPropertyChanged();
        exportSettings.OnChange();
      }
    }

    public string ExportDirectory
    {
      get => exportSettings.ExportDirectory;
      set
      {
        exportSettings.ExportDirectory = value;
        OnPropertyChanged();
        exportSettings.OnChange();
      }
    }

    // Config settings
    public bool EncryptConfiguration
    {
      get => configSettings.EncryptConfiguration;
      set
      {
        configSettings.EncryptConfiguration = value;
        OnPropertyChanged();
        configSettings.OnChange();
      }
    }

    [RelayCommand]
    private async Task BrowseDownloadDirectory()
    {
      if (BrowseFolderRequested is not null)
      {
        string path = await BrowseFolderRequested.Invoke("Select Download Folder");
        if (!path.IsNullOrWhiteSpace())
        {
          DownloadDirectory = path;
        }
      }
    }

    [RelayCommand]
    private async Task BrowseExportDirectory()
    {
      if (BrowseFolderRequested is not null)
      {
        string path = await BrowseFolderRequested.Invoke("Select Export Folder");
        if (!path.IsNullOrWhiteSpace())
        {
          ExportDirectory = path;
        }
      }
    }
  }
}
