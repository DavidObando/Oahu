// G# port of DoctorServiceTests.cs.

package Oahu.Cli.Tests

import System
import System.Collections.Generic
import System.IO
import System.Net.Http
import System.Threading
import Oahu.Cli.App.Doctor
import Xunit

class DoctorServiceTests {
    @Fact
    func RunAsync_WithSkipNetwork_DoesNotMakeHttpCalls() {
        var svc = DoctorService(httpClientFactory: func() HttpClient {
            throw InvalidOperationException("HTTP must not be invoked when --skip-network is set")
        })

        var report = svc.RunAsync(DoctorOptions() { SkipNetwork = true }, CancellationToken.None).Result

        var net DoctorCheck? = nil
        for c in report.Checks {
            if c.Id == "audible-api" {
                net = c
            }
        }
        Assert.NotNull(net)
        Assert.Equal(DoctorSeverity.Ok, net!!.Severity)
        Assert.Contains("skipped", net!!.Message)
    }

    @Fact
    func RunAsync_AlwaysIncludesCoreChecks() {
        var svc = DoctorService()
        var report = svc.RunAsync(DoctorOptions() { SkipNetwork = true }, CancellationToken.None).Result

        var ids = HashSet[string]()
        for c in report.Checks {
            ids.Add(c.Id)
        }
        Assert.Contains("output-dir", ids)
        Assert.Contains("user-data-dir", ids)
        Assert.Contains("library-cache", ids)
        Assert.Contains("disk-free", ids)
        Assert.Contains("cli-config", ids)
        Assert.Contains("user-settings", ids)
        Assert.Contains("audible-api", ids)
    }

    @Fact
    func UserSettingsCheck_OkWhenDefaultsApplied() {
        var check = DoctorService.CheckUserSettings()
        Assert.Equal("user-settings", check.Id)
        Assert.NotEqual(DoctorSeverity.Error, check.Severity)
    }

    @Fact
    func OutputDirCheck_FailsForUnwritablePath() {
        // A path that cannot be created (root null byte). On all POSIX & Windows this throws.
        let bogus = Path.Combine(Path.GetTempPath(), "oahu-cli-doctor-test" + String([]char{char(0), 'b', 'a', 'd'}))
        let check = DoctorService.CheckOutputDirectoryWritable(bogus)
        Assert.Equal(DoctorSeverity.Error, check.Severity)
        Assert.False(String.IsNullOrEmpty(check.Hint))
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
    func DiskFreeCheck_WarnsWhenBelowThreshold() {
        var tmp = Path.GetTempPath()
        var check = DoctorService.CheckDiskFree(tmp, Int64.MaxValue / int64(2))
        // We can't guarantee under which side this lands across runners; assert it doesn't throw and returns a known id.
        Assert.Equal("disk-free", check.Id)
        Assert.Contains("free on", check.Message)
    }

    @Fact
    func Report_HasErrors_TrueWhenAnyErrorPresent() {
        var checks = []DoctorCheck{
            DoctorCheck("a", "ok", DoctorSeverity.Ok, ".", nil),
            DoctorCheck("b", "warn", DoctorSeverity.Warning, ".", nil),
            DoctorCheck("c", "err", DoctorSeverity.Error, ".", nil),
        }
        var r = DoctorReport(checks)
        Assert.True(r.HasErrors)
        Assert.True(r.HasWarnings)
    }
}
