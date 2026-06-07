// G# port of App/JsonConfigServiceTests.cs.
//
// Tests the JSON config service: load-from-missing returns default, save then
// load round-trips, no .tmp leftover, overwrite is atomic.
//
// LIMITATION: OahuConfig is a C# record with init-only properties. Cannot
// construct modified instances in G# (gsharp init-only limitation). Tests are
// restricted to using OahuConfig.Default only. The "round trips all fields"
// and "overwrites atomically with different values" tests are weakened — they
// verify the save→load mechanic with the default instance only.

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
    func Save_Then_Load_Round_Trips_Default() {
        defer cleanup()
        var svc = JsonConfigService(tempFile)
        svc.SaveAsync(OahuConfig.Default).Wait()

        var fresh = JsonConfigService(tempFile)
        var reloaded = fresh.LoadAsync().Result
        Assert.Equal[OahuConfig](OahuConfig.Default, reloaded)
    }

    @Fact
    func Save_Leaves_No_Tmp_File_Behind() {
        defer cleanup()
        var svc = JsonConfigService(tempFile)
        svc.SaveAsync(OahuConfig.Default).Wait()
        Assert.True(File.Exists(tempFile))
        Assert.False(File.Exists(tempFile + ".tmp"))
    }

    @Fact
    func Save_Overwrites_Existing_File_Atomically() {
        defer cleanup()
        var svc = JsonConfigService(tempFile)
        // Save twice to exercise the overwrite path.
        svc.SaveAsync(OahuConfig.Default).Wait()
        svc.SaveAsync(OahuConfig.Default).Wait()
        var reloaded = svc.LoadAsync().Result
        Assert.Equal[OahuConfig](OahuConfig.Default, reloaded)
        Assert.False(File.Exists(tempFile + ".tmp"))
    }
}
