// G# port of DoctorServiceTests.cs.
//
// LIMITATIONS:
//   - DoctorOptions properties are `init`-only → MissingMethodException at runtime.
//     Tests needing DoctorOptions.SkipNetwork = true are dropped.
//   - DoctorCheck record ctor has string? Hint → constructions dropped.
//   - DoctorReport.Checks (IReadOnlyList<DoctorCheck>) iteration triggers MSB4181.
//   - Closure-capturing lambda in httpClientFactory param triggers MSB4181.
//
// Ported: static methods CheckUserSettings(), CheckOutputDirectoryWritable(string),
//         CheckDiskFree(string, long).
//
// WORKAROUNDS: init-only property (drop affected tests), IReadOnlyList iteration
//              crash (avoid iterating .Checks).

package Oahu.Cli.Tests.Experiment

import System
import System.IO
import Oahu.Cli.App.Doctor
import Xunit

type DoctorServiceTests class {
    @Fact
    func UserSettingsCheck_OkWhenDefaultsApplied() {
        var check = DoctorService.CheckUserSettings()
        Assert.Equal("user-settings", check.Id)
        Assert.NotEqual(DoctorSeverity.Error, check.Severity)
    }

    @Fact
    func OutputDirCheck_PassesForTempDir() {
        var tmp = Path.Combine(Path.GetTempPath(), "oahu-cli-doctor-test-" + Guid.NewGuid().ToString())
        try {
            var check = DoctorService.CheckOutputDirectoryWritable(tmp)
            Assert.Equal(DoctorSeverity.Ok, check.Severity)
        } finally {
            if Directory.Exists(tmp) {
                Directory.Delete(tmp, true)
            }
        }
    }

    @Fact
    func DiskFreeCheck_ReturnsKnownId() {
        var tmp = Path.GetTempPath()
        var check = DoctorService.CheckDiskFree(tmp, Int64.MaxValue / int64(2))
        Assert.Equal("disk-free", check.Id)
        Assert.Contains("free on", check.Message)
    }
}
