// G# port of Commands/ConfigCommandTests.cs — full port.
// Init-only properties and object initializers now work in 0.1.459.

package Oahu.Cli.Tests.Experiment.Commands

import System
import System.IO
import Oahu.Cli.App.Config
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import Xunit

type ConfigCommandTests class {
    @Fact
    func ToDictionary_ContainsEveryDocumentedKey() {
        var dict = ConfigCommand.ToDictionary(OahuConfig.Default)
        for key in ConfigCommand.Keys {
            Assert.True(dict.ContainsKey(key), "missing key: $key")
        }
        Assert.Equal(ConfigCommand.Keys.Count, dict.Count)
    }

    @Fact
    func ApplySetting_RoundTripsAllKeys() {
        var cfg = OahuConfig.Default
        cfg = ConfigCommand.ApplySetting(cfg, "download-dir", "/tmp/foo")
        cfg = ConfigCommand.ApplySetting(cfg, "default-quality", "Extreme")
        cfg = ConfigCommand.ApplySetting(cfg, "max-parallel-jobs", "4")
        cfg = ConfigCommand.ApplySetting(cfg, "keep-encrypted-files", "true")
        cfg = ConfigCommand.ApplySetting(cfg, "multi-part-download", "yes")
        cfg = ConfigCommand.ApplySetting(cfg, "export-to-aax", "1")
        cfg = ConfigCommand.ApplySetting(cfg, "export-dir", "/tmp/aax")
        cfg = ConfigCommand.ApplySetting(cfg, "default-profile-alias", "main")
        cfg = ConfigCommand.ApplySetting(cfg, "allow-encrypted-file-credentials", "off")
        cfg = ConfigCommand.ApplySetting(cfg, "theme", "HighContrast")

        Assert.Equal("/tmp/foo", cfg.DownloadDirectory)
        Assert.Equal(DownloadQuality.Extreme, cfg.DefaultQuality)
        Assert.Equal(4, cfg.MaxParallelJobs)
        Assert.True(cfg.KeepEncryptedFiles)
        Assert.True(cfg.MultiPartDownload)
        Assert.True(cfg.ExportToAax)
        Assert.Equal("/tmp/aax", cfg.ExportDirectory)
        Assert.Equal("main", cfg.DefaultProfileAlias)
        Assert.False(cfg.AllowEncryptedFileCredentials)
        Assert.Equal("HighContrast", cfg.Theme)
    }

    @Fact
    func ApplySetting_Theme_AcceptsCaseInsensitive_And_NormalizesCasing() {
        var cfg = ConfigCommand.ApplySetting(OahuConfig.Default, "theme", "highcontrast")
        Assert.Equal("HighContrast", cfg.Theme)
    }

    @Fact
    func ApplySetting_Theme_EmptyClearsOverride() {
        var cfg = OahuConfig() { Theme = "Mono" }
        cfg = ConfigCommand.ApplySetting(cfg, "theme", String.Empty)
        Assert.Null(cfg.Theme)
    }

    @Fact
    func ApplySetting_InvalidThemeThrows() {
        Assert.Throws[ArgumentException](func() { ConfigCommand.ApplySetting(OahuConfig.Default, "theme", "Solarized") })
    }

    @Fact
    func ApplySetting_UnknownKeyThrows() {
        Assert.Throws[ArgumentException](func() { ConfigCommand.ApplySetting(OahuConfig.Default, "nope", "x") })
    }

    @Fact
    func ApplySetting_InvalidQualityThrows() {
        Assert.Throws[ArgumentException](func() { ConfigCommand.ApplySetting(OahuConfig.Default, "default-quality", "ultra") })
    }

    @Fact
    func ApplySetting_InvalidBoolThrows() {
        Assert.Throws[ArgumentException](func() { ConfigCommand.ApplySetting(OahuConfig.Default, "keep-encrypted-files", "maybe") })
    }

    @Fact
    func ApplySetting_InvalidIntThrows() {
        Assert.Throws[ArgumentException](func() { ConfigCommand.ApplySetting(OahuConfig.Default, "max-parallel-jobs", "0") })
    }

    @Fact
    func Save_Then_Load_PersistsAllChanges() {
        var path = Path.Combine(Path.GetTempPath(), "oahu-cfg-${Guid.NewGuid().ToString("N")}.json")
        try {
            var svc = JsonConfigService(path)
            var cfg = ConfigCommand.ApplySetting(OahuConfig.Default, "max-parallel-jobs", "7")
            svc.SaveAsync(cfg).GetAwaiter().GetResult()
            var reloaded = JsonConfigService(path).LoadAsync().GetAwaiter().GetResult()
            Assert.Equal(7, reloaded.MaxParallelJobs)
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }
}
