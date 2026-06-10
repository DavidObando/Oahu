// Sanity tests for src/Oahu.Cli.App.Experiment/AtomicFile.gs.

package Oahu.Cli.Tests.Experiment

import System
import System.IO
import System.Text.Json
import Oahu.Cli.App.Experiment
import Xunit

type ExpAtomicFileTests class {

    func makeTempPath() string {
        return Path.Combine(Path.GetTempPath(), "oahu-cli-atomic-" + Guid.NewGuid().ToString("N") + ".json")
    }

    @Fact
    func ReadJson_Returns_Nil_When_Missing() {
        var af = ExpAtomicFile()
        let path = makeTempPath()
        let result = af.ReadJson(path, typeof(string), nil)
        Assert.Null(result)
    }

    @Fact
    func WriteAllJson_Creates_File() {
        var af = ExpAtomicFile()
        let path = makeTempPath()
        defer File.Delete(path)
        af.WriteAllJson(path, "hello" as object, nil)
        Assert.True(File.Exists(path))
    }

    @Fact
    func WriteAllJson_RoundTrips_String() {
        var af = ExpAtomicFile()
        let path = makeTempPath()
        defer File.Delete(path)
        af.WriteAllJson(path, "round-trip" as object, nil)
        let result = af.ReadJson(path, typeof(string), nil)
        Assert.Equal[object?]("round-trip", result)
    }

    @Fact
    func WriteAllJson_Overwrites_Existing() {
        var af = ExpAtomicFile()
        let path = makeTempPath()
        defer File.Delete(path)
        af.WriteAllJson(path, "first" as object, nil)
        af.WriteAllJson(path, "second" as object, nil)
        let result = af.ReadJson(path, typeof(string), nil)
        Assert.Equal[object?]("second", result)
    }

    @Fact
    func WriteAllJson_Leaves_No_Tmp_File() {
        var af = ExpAtomicFile()
        let path = makeTempPath()
        defer File.Delete(path)
        af.WriteAllJson(path, "value" as object, nil)
        let dir = Path.GetDirectoryName(path)!!
        let basename string = Path.GetFileName(path) ?: ""
        let leftovers = Directory.GetFiles(dir, basename + ".*.tmp")
        Assert.Empty(leftovers)
    }

    @Fact
    func DefaultJsonOptions_Are_Configured() {
        var af = ExpAtomicFile()
        Assert.True(af.DefaultJsonOptions.WriteIndented)
    }
}
