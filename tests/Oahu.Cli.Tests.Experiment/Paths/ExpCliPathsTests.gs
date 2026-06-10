// Sanity tests for src/Oahu.Cli.App.Experiment/Paths/CliPaths.gs.

package Oahu.Cli.Tests.Experiment.Paths

import System
import System.IO
import System.Runtime.InteropServices
import Oahu.Cli.App.Experiment.Paths
import Xunit

type ExpCliPathsTests class {

    @Fact
    func Ensure_Populates_Both_Dirs() {
        var p = ExpCliPaths()
        p.ensure()
        Assert.False(String.IsNullOrEmpty(p.ConfigDir))
        Assert.False(String.IsNullOrEmpty(p.LogDir))
    }

    @Fact
    func ConfigDir_EndsWith_oahu() {
        var p = ExpCliPaths()
        p.ensure()
        Assert.EndsWith("oahu", p.ConfigDir)
    }

    @Fact
    func LogDir_Contains_oahu() {
        var p = ExpCliPaths()
        p.ensure()
        Assert.Contains("oahu", p.LogDir)
    }

    @Fact
    func ConfigFile_EndsWith_config_json() {
        var p = ExpCliPaths()
        p.ensure()
        Assert.EndsWith("config.json", p.ConfigFile())
    }

    @Fact
    func TodayLogFile_Has_yyyymmdd() {
        var p = ExpCliPaths()
        p.ensure()
        let f = p.TodayLogFile()
        let stamp = DateTime.Now.ToString("yyyyMMdd")
        Assert.Contains(stamp, f)
    }

    @Fact
    func DefaultDownloadDir_NonEmpty() {
        var p = ExpCliPaths()
        Assert.False(String.IsNullOrEmpty(p.DefaultDownloadDir()))
    }

    @Fact
    func EnsureDirectories_Creates_Both() {
        var p = ExpCliPaths()
        p.ensure()
        p.EnsureDirectories()
        Assert.True(Directory.Exists(p.ConfigDir))
        Assert.True(Directory.Exists(p.LogDir))
    }
}
