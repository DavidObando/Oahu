using System;
using System.IO;
using Oahu.Aux;
using Oahu.Core;

namespace Oahu.App.Avalonia
{
  public class UserSettings : IUserSettings, IInitSettings
  {
    private static readonly string DefaultDownloadDirectory =
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Music", "Oahu", "Downloads");

    public DownloadSettings DownloadSettings { get; set; } = new DownloadSettings();

    public ConfigSettings ConfigSettings { get; set; } = new ConfigSettings();

    public ExportSettings ExportSettings { get; set; } = new ExportSettings();

    public void Init()
    {
      DownloadSettings.DownloadDirectory ??= DefaultDownloadDirectory;

      DownloadSettings.ChangedSettings += OnChangedSettings;
      ConfigSettings.ChangedSettings += OnChangedSettings;
      ExportSettings.ChangedSettings += OnChangedSettings;
    }

    private void OnChangedSettings(object sender, EventArgs e) => this.Save();
  }
}
