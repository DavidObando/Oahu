// G# port of App/JsonConfigServiceTests.cs.
//
// Tests the JSON config service: load-from-missing returns default, save then
// load round-trips, no .tmp leftover, overwrite is atomic. With init-only
// properties now consumable from G#, the round-trip tests use non-default
// values for every field — matching the C# version field-for-field.

package Oahu.Cli.Tests.Experiment.App

import System
import System.IO
import Oahu.Cli.App.Config
import Oahu.Cli.App.Models
import Xunit

type JsonConfigServiceTests class {
    tempFile string

    init() {
        tempFile = Path.Combine(Path.GetTempPath(), "oahu-cli-config-${Guid.NewGuid().ToString("n")}.json")
    }

    func cleanup() {
        if File.Exists(tempFile) {
            File.Delete(tempFile)
        }
        let tmp = tempFile + ".tmp"
        if File.Exists(tmp) {
            File.Delete(tmp)
        }
    }

    @Fact
    func Load_Returns_Default_When_File_Missing() {
        defer cleanup()
        var svc = JsonConfigService(tempFile)
        var cfg = svc.LoadAsync().Result
        Assert.Equal[OahuConfig](OahuConfig.Default, cfg)
    }

    @Fact
    func Save_Then_Load_Round_Trips_All_Fields() {
        defer cleanup()
        var svc = JsonConfigService(tempFile)
        var cfg = OahuConfig() {
            DownloadDirectory = "/tmp/x",
            DefaultQuality = DownloadQuality.Extreme,
            MaxParallelJobs = 4,
            KeepEncryptedFiles = true,
            MultiPartDownload = true,
            ExportToAax = true,
            ExportDirectory = "/tmp/aax",
            DefaultProfileAlias = "main",
            AllowEncryptedFileCredentials = true,
        }
        svc.SaveAsync(cfg).Wait()

        var reloaded = JsonConfigService(tempFile).LoadAsync().Result
        Assert.Equal[OahuConfig](cfg, reloaded)
    }

    @Fact
    func Save_Leaves_No_Tmp_File_Behind() {
        defer cleanup()
        var svc = JsonConfigService(tempFile)
        var cfg = OahuConfig() { MaxParallelJobs = 7 }
        svc.SaveAsync(cfg).Wait()
        Assert.True(File.Exists(tempFile))
        Assert.False(File.Exists(tempFile + ".tmp"))
    }

    @Fact
    func Save_Overwrites_Existing_File_Atomically() {
        defer cleanup()
        var svc = JsonConfigService(tempFile)
        svc.SaveAsync(OahuConfig() { MaxParallelJobs = 1 }).Wait()
        svc.SaveAsync(OahuConfig() { MaxParallelJobs = 9 }).Wait()
        var reloaded = svc.LoadAsync().Result
        Assert.Equal(9, reloaded.MaxParallelJobs)
        Assert.False(File.Exists(tempFile + ".tmp"))
    }
}

