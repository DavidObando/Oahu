// Sanity tests for src/Oahu.Cli.App.Experiment/Config/ExpJsonConfigService.gs.

package Oahu.Cli.Tests.Experiment.Config

import System
import System.IO
import System.Threading
import Oahu.Cli.App.Experiment.Config
import Oahu.Cli.App.Models
import Xunit

type ExpJsonConfigServiceTests class {
    tempFile string = ""

    init() {
        tempFile = Path.Combine(Path.GetTempPath(), "oahu-cli-expcfg-" + Guid.NewGuid().ToString("N") + ".json")
    }

    func cleanup() {
        if File.Exists(tempFile) {
            File.Delete(tempFile)
        }
    }

    @Fact
    func Load_Returns_Default_When_File_Missing() {
        defer cleanup()
        var svc = ExpJsonConfigService() { FilePath = tempFile }
        var cfg = svc.LoadAsync(CancellationToken.None).Result
        Assert.Equal[OahuConfig](OahuConfig.Default, cfg)
    }

    @Fact
    func Path_Returns_Configured_Path() {
        defer cleanup()
        var svc = ExpJsonConfigService() { FilePath = tempFile }
        Assert.Equal(tempFile, svc.Path())
    }

    @Fact
    func Save_Then_Load_RoundTrips() {
        defer cleanup()
        var svc = ExpJsonConfigService() { FilePath = tempFile }
        var cfg = OahuConfig() {
            DownloadDirectory = "/x/y",
            DefaultQuality = DownloadQuality.High,
            MaxParallelJobs = 7,
        }
        svc.SaveAsync(cfg, CancellationToken.None).Wait()
        var loaded = svc.LoadAsync(CancellationToken.None).Result
        Assert.Equal("/x/y", loaded.DownloadDirectory)
        Assert.Equal[DownloadQuality](DownloadQuality.High, loaded.DefaultQuality)
        Assert.Equal[int32](7, loaded.MaxParallelJobs)
    }

    @Fact
    func Save_Creates_File() {
        defer cleanup()
        var svc = ExpJsonConfigService() { FilePath = tempFile }
        svc.SaveAsync(OahuConfig.Default, CancellationToken.None).Wait()
        Assert.True(File.Exists(tempFile))
    }

    @Fact
    func Implements_Interface() {
        defer cleanup()
        var svc = ExpJsonConfigService() { FilePath = tempFile }
        Assert.IsAssignableFrom[IExpConfigService](svc)
    }
}
