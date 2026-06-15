// G# port of CliPathsTests.cs.
//
// Verifies that CliPaths.EnsureDirectories is idempotent, that TodayLogFile
// produces a path of the expected shape, and that DefaultDownloadDir resolves
// under the user's Music/Oahu/Downloads layout.

package Oahu.Cli.Tests

import System.IO
import System.Text.RegularExpressions
import Oahu.Cli.App.Paths
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
        var path = CliPaths.TodayLogFile()
        Assert.StartsWith(CliPaths.LogDir, path)
        Assert.EndsWith(".log", path)
        var name = Path.GetFileName(path)
        Assert.Matches(`^oahu-cli-\d{8}\.log$`, name)
    }

    @Fact
    func DefaultDownloadDir_IsUnderUserMusicOahu() {
        Assert.Contains("Oahu", CliPaths.DefaultDownloadDir)
        Assert.Contains("Downloads", CliPaths.DefaultDownloadDir)
    }
}
