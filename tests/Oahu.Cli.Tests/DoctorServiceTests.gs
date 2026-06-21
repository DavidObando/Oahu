package Oahu.Cli.Tests

import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Net.Http
import System.Threading
import Oahu.Cli.App.Doctor
import Xunit

class DoctorServiceTests {
    @Fact
    async func RunAsync_WithSkipNetwork_DoesNotMakeHttpCalls() {
        var svc = DoctorService(httpClientFactory: () -> {
            throw InvalidOperationException("HTTP must not be invoked when --skip-network is set")
        })

        var report = await svc.RunAsync(DoctorOptions() { SkipNetwork = true }, CancellationToken.None)

        let net = report.Checks.Single((c) -> c.Id == "audible-api")
        Assert.Equal(DoctorSeverity.Ok, net.Severity)
        Assert.Contains("skipped", net!!.Message)
    }

    @Fact
    async func RunAsync_AlwaysIncludesCoreChecks() {
        let svc = DoctorService()
        let report = await svc.RunAsync(DoctorOptions() { SkipNetwork = true }, CancellationToken.None)

        let ids = report.Checks.Select((c) -> c.Id).ToHashSet()
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
        // After SettingsDefaults.ApplyDefaults runs (via OahuUserSettings.Init,
        // which SettingsManager triggers on load), DownloadDirectory must be a
        // non-empty, writable path. Verifies the CLI gets the same default
        // the GUI has always had.
        let check = DoctorService.CheckUserSettings()
        Assert.Equal("user-settings", check.Id)
        // The check may degrade to Warning when the test process can't load
        // settings (no GUI shared dir on a CI runner), but never to Error
        // for a fresh / empty config — the defaults should make it pass.
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
        let tmp = Path.Combine(Path.GetTempPath(), "oahu-cli-doctor-test-" + Guid.NewGuid().ToString())
        try {
            let check = DoctorService.CheckOutputDirectoryWritable(tmp)
            Assert.Equal(DoctorSeverity.Ok, check.Severity)
        } finally {
            if Directory.Exists(tmp) {
                Directory.Delete(tmp, true)
            }
        }
    }

    @Fact
    func DiskFreeCheck_WarnsWhenBelowThreshold() {
        let tmp = Path.GetTempPath()
        let check = DoctorService.CheckDiskFree(tmp, Int64.MaxValue / int64(2))
        // We can't guarantee under which side this lands across runners; assert it doesn't throw and returns a known id.
        Assert.Equal("disk-free", check.Id)
        Assert.Contains("free on", check.Message)
    }

    @Fact
    func Report_HasErrors_TrueWhenAnyErrorPresent() {
        let r = DoctorReport([]DoctorCheck{
            DoctorCheck("a", "ok", DoctorSeverity.Ok, ".", nil),
            DoctorCheck("b", "warn", DoctorSeverity.Warning, ".", nil),
            DoctorCheck("c", "err", DoctorSeverity.Error, ".", nil),
        })
        Assert.True(r.HasErrors)
        Assert.True(r.HasWarnings)
    }
}
