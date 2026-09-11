package Oahu.Cli.Tests

import Oahu.Cli.App.Paths
import System
import System.IO
import Xunit

class CliPathsTests {
    @Fact
    func EnsureDirectories_IsIdempotent() {
        CliPaths.EnsureDirectories()
        CliPaths.EnsureDirectories()
        Assert.True(Directory.Exists(CliPaths.ConfigDir))
        Assert.True(Directory.Exists(CliPaths.LogDir))
    }

    @Fact
    func TodayLogFile_HasExpectedShape() {
        let path = CliPaths.TodayLogFile()
        Assert.StartsWith(CliPaths.LogDir, path)
        Assert.EndsWith(".log", path)
        let name = Path.GetFileName(path)
        Assert.Matches("^oahu-cli-\\d{8}\\.log$$", name)
    }

    @Fact
    func DefaultDownloadDir_IsUnderUserMusicOahu() {
        Assert.Contains("Oahu", CliPaths.DefaultDownloadDir)
        Assert.Contains("Downloads", CliPaths.DefaultDownloadDir)
    }
}
