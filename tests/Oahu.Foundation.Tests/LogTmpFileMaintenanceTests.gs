package Oahu.Foundation.Tests

import Oahu.Aux
import Oahu.Common.Util
import System
import System.IO
import System.Linq
import System.Reflection
import Xunit

class LogTmpFileMaintenanceTests {
    @Fact
    func Cleanup_Logs_Removed_File_And_Size_Totals_Across_Temp_And_Log_Directories() {
        let contents = RunCleanup(
            (appName string) -> {
                WriteOldFile(Path.Combine(ApplEnv.TempDirectory, "stale.tmp"), 1024)
                WriteTodayFile(Path.Combine(ApplEnv.TempDirectory, "fresh.tmp"), 4096)
                WriteOldFile(Path.Combine(ApplEnv.LogDirectory, "stale.log"), 2048)
                WriteTodayFile(Path.Combine(ApplEnv.LogDirectory, "fresh.log"), 5120)
            }
        )
        Assert.Contains("#files=4/2/2", contents)
        Assert.Contains("size=12/9/3 kB", contents)
    }

    @Fact
    func Cleanup_Does_Not_Throw_When_First_Pass_Empties_Both_Directories() {
        let contents = RunCleanup(
            (appName string) -> {
                WriteOldFile(Path.Combine(ApplEnv.TempDirectory, "stale.tmp"), 1024)
                WriteOldFile(Path.Combine(ApplEnv.LogDirectory, "stale.log"), 2048)
            }
        )
        Assert.Contains("#files=2/0/2", contents)
        Assert.Contains("size=3/0/3 kB", contents)
    }

    shared {
        private func WriteOldFile(path string, size int32) {
            File.WriteAllBytes(path, Enumerable.Repeat(uint8('x'), size).ToArray())
            File.SetLastWriteTime(path, DateTime.Today.AddDays(-366).AddHours(12.0))
        }

        private func WriteTodayFile(path string, size int32) {
            File.WriteAllBytes(path, Enumerable.Repeat(uint8('y'), size).ToArray())
            File.SetLastWriteTime(path, DateTime.Today.AddHours(12.0))
        }

        private func RunCleanup(seedFiles(string) -> void) string {
            let appName = "Oahu.Foundation.Tests.LogTmpFileMaintenance.${Guid.NewGuid():N}"
            let originalAppName = ApplEnv.ApplName
            let logging = GetLoggingInstance()
            let originalLevel = GetLoggingLevel(logging)
            let originalInstantFlush = Logging.InstantFlush
            var testRoot string? = nil
            try {
                ApplEnv.OverrideApplName(appName)
                ResetLogging(logging)
                Logging.InstantFlush = true
                SetLoggingLevel(logging, 2)
                testRoot = ApplEnv.LocalApplDirectory
                Directory.CreateDirectory(ApplEnv.TempDirectory)
                Directory.CreateDirectory(ApplEnv.LogDirectory)
                seedFiles(appName)
                LogTmpFileMaintenance.Instance!!.Cleanup()
                let logFile = Assert.Single(Directory.GetFiles(ApplEnv.LogDirectory, "${appName}_*.log"))
                return File.ReadAllText(logFile)
            } finally {
                Logging.InstantFlush = originalInstantFlush
                SetLoggingLevel(logging, originalLevel)
                ResetLogging(logging)
                ApplEnv.OverrideApplName(originalAppName!!)
                ResetLogging(logging)
                if testRoot != nil && Directory.Exists(testRoot) {
                    Directory.Delete(testRoot, recursive: true)
                }
            }
        }

        private func GetLoggingInstance() object -> typeof(Logging).GetProperty(
            "Instance",
            BindingFlags.NonPublic | BindingFlags.Static
        )!!.GetValue(nil)!!

        private func GetLoggingLevel(logging object) int32 -> int32(
            typeof(Logging).GetField("level", BindingFlags.NonPublic | BindingFlags.Instance)!!.GetValue(logging)!!
        )

        private func SetLoggingLevel(logging object, level int32) -> typeof(Logging).GetField(
            "level",
            BindingFlags.NonPublic | BindingFlags.Instance
        )!!.SetValue(logging, level)

        private func ResetLogging(logging object) {
            typeof(Logging).GetMethod("Close", BindingFlags.NonPublic | BindingFlags.Instance)!!.Invoke(logging, nil)
            typeof(Logging).GetMethod("SetFileNameStub", BindingFlags.NonPublic | BindingFlags.Instance)!!.Invoke(
                logging,
                nil
            )
        }
    }
}
