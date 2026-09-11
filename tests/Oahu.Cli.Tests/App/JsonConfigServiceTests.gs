package Oahu.Cli.Tests.App

import Oahu.Cli.App.Config
import Oahu.Cli.App.Models
import System
import System.IO
import System.Threading.Tasks
import Xunit

class JsonConfigServiceTests : IDisposable {
    private let tempFile string

    init() {
        tempFile = Path.Combine(Path.GetTempPath(), "oahu-cli-config-${Guid.NewGuid():n}.json")
    }

    func Dispose() {
        if File.Exists(tempFile) {
            File.Delete(tempFile)
        }
        let tmp = tempFile + ".tmp"
        if File.Exists(tmp) {
            File.Delete(tmp)
        }
    }

    @Fact
    async func Load_Returns_Default_When_File_Missing() {
        let svc = JsonConfigService(tempFile)
        let cfg = await svc.LoadAsync()
        Assert.Equal(OahuConfig.Default, cfg)
    }

    @Fact
    async func Save_Then_Load_Round_Trips_All_Fields() {
        let svc = JsonConfigService(tempFile)
        let cfg = OahuConfig.Default with{
            DownloadDirectory = "/tmp/x",
            DefaultQuality = DownloadQuality.Extreme,
            MaxParallelJobs = 4,
            KeepEncryptedFiles = true,
            MultiPartDownload = true,
            ExportToAax = true,
            ExportDirectory = "/tmp/aax",
            DefaultProfileAlias = "main",
            AllowEncryptedFileCredentials = true
        }
        await svc.SaveAsync(cfg)
        let reloaded = await JsonConfigService(tempFile).LoadAsync()
        Assert.Equal(cfg, reloaded)
    }

    @Fact
    async func Save_Leaves_No_Tmp_File_Behind() {
        let svc = JsonConfigService(tempFile)
        await svc.SaveAsync(OahuConfig.Default with{MaxParallelJobs = 7})
        Assert.True(File.Exists(tempFile))
        Assert.False(File.Exists(tempFile + ".tmp"))
    }

    @Fact
    async func Save_Overwrites_Existing_File_Atomically() {
        let svc = JsonConfigService(tempFile)
        await svc.SaveAsync(OahuConfig.Default with{MaxParallelJobs = 1})
        await svc.SaveAsync(OahuConfig.Default with{MaxParallelJobs = 9})
        let reloaded = await svc.LoadAsync()
        Assert.Equal(9, reloaded.MaxParallelJobs)
        Assert.False(File.Exists(tempFile + ".tmp"))
    }
}
