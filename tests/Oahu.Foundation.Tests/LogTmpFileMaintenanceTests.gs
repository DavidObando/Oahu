package Oahu.Foundation.Tests

import Oahu.Aux
import Oahu.Aux.Extensions
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

    @Fact
    func Cleanup_Preserves_The_One_Remaining_File_Newer_Than_The_Cutoff() {
        RunCleanup((appName string) -> {
            let fresh = Path.Combine(ApplEnv.TempDirectory, "recent.tmp")
            File.WriteAllText(fresh, "keep")
            File.SetLastWriteTime(fresh, DateTime.Today.AddDays(-1))
            WriteOldFile(Path.Combine(ApplEnv.TempDirectory, "old-one.tmp"), 1024)
            WriteOldFile(Path.Combine(ApplEnv.TempDirectory, "old-two.tmp"), 1024)
            LogTmpFileMaintenance.Instance!!.Cleanup()
            Assert.True(File.Exists(fresh))
        })
    }

    @Fact
    func ProcessList_Rejects_Add_After_Dispose() {
        using let process = System.Diagnostics.Process()
        let list = ProcessList()
        list.Dispose()
        Assert.Throws[ObjectDisposedException](() -> list.Add(process))
    }

    @Fact
    func Unix_Long_Paths_Are_Not_Rewritten_As_Windows_Unc_Paths() {
        if OperatingSystem.IsWindows() { return }
        let path = "/tmp/" + System.String('x', 260)
        Assert.Equal(path, path.AsUncIfLong())
        Assert.Equal(path, path.AsUnc())
    }

    @Fact
    func Typed_Interaction_Message_Accepts_Its_Nullable_Message() {
        let message = InteractionMessage[string](ECallbackType.Question3, nil, "custom")
        let baseMessage InteractionMessage = message
        Assert.Null(message.Message)
        Assert.Equal(string.Empty, baseMessage.Message)
        Assert.Equal("custom", message.Custom)
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
