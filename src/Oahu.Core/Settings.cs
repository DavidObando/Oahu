using System;
using Oahu.Aux.Diagnostics;
using Oahu.BooksDatabase;
using Oahu.Common.Util;

namespace Oahu.Core
{
  public interface IConfigSettings
  {
    bool EncryptConfiguration { get; }
  }

  public interface IMultiPartSettings
  {
    bool MultiPartDownload { get; }
  }

  public interface IAuthorizeSettings
  {
    bool AutoRefresh { get; }
  }

  public interface IDownloadSettings : IMultiPartSettings, IAuthorizeSettings
  {
    event EventHandler ChangedSettings;

    bool AutoUpdateLibrary { get; }

    bool AutoOpenDownloadDialog { get; }

    bool IncludeAdultProducts { get; }

    bool HideUnavailableProducts { get; }

    bool KeepEncryptedFiles { get; }

    EDownloadQuality DownloadQuality { get; }

    string DownloadDirectory { get; }

    EInitialSorting InitialSorting { get; }
  }

  public interface IExportSettings
  {
    bool? ExportToAax { get; }

    [ToString(typeof(ToStringConverterPath))]
    string ExportDirectory { get; }
  }

  public abstract class SettingsBase
  {
    public event EventHandler ChangedSettings;

    public void OnChange() => ChangedSettings?.Invoke(this, EventArgs.Empty);
  }

  public class ConfigSettings : SettingsBase, IConfigSettings
  {
    private bool encryptConfiguration = true;

    public bool EncryptConfiguration
    {
      get => encryptConfiguration;
      set
      {
        encryptConfiguration = value;
        OnChange();
      }
    }
  }

  public class DownloadSettings : SettingsBase, IDownloadSettings
  {
    private EDownloadQualityReducedChoices downloadQuality = EDownloadQualityReducedChoices.High;

    public bool AutoRefresh { get; set; }

    public bool AutoUpdateLibrary { get; set; } = true;

    public bool AutoOpenDownloadDialog { get; set; }

    public bool IncludeAdultProducts { get; set; }

    public bool HideUnavailableProducts { get; set; }

    public bool MultiPartDownload { get; set; }

    public bool KeepEncryptedFiles { get; set; }

    public EDownloadQuality DownloadQuality
    {
      get => downloadQuality.ToFullChoices();
      set => downloadQuality = value.ToReducedChoices();
    }

    public string DownloadDirectory { get; set; }

    public EInitialSorting InitialSorting { get; set; }

    public ProfileAliasKey Profile { get; set; }
  }

  public class ExportSettings : SettingsBase, IExportSettings
  {
    private bool? exportToAax;
    private string exportDirectory;

    public bool? ExportToAax
    {
      get => exportToAax;
      set
      {
        exportToAax = value;
        OnChange();
      }
    }

    public string ExportDirectory
    {
      get => exportDirectory;
      set
      {
        exportDirectory = value;
        OnChange();
      }
    }
  }
}
