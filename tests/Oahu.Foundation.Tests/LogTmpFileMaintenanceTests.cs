using System.Reflection;
using Oahu.Aux;
using Oahu.Common.Util;
using Xunit;

namespace Oahu.Foundation.Tests;

public class LogTmpFileMaintenanceTests
{
    [Fact]
    public void Cleanup_Logs_Removed_File_And_Size_Totals_Across_Temp_And_Log_Directories()
    {
        var contents = RunCleanup(appName =>
        {
            WriteOldFile(Path.Combine(ApplEnv.TempDirectory, "stale.tmp"), 1024);
            WriteTodayFile(Path.Combine(ApplEnv.TempDirectory, "fresh.tmp"), 4096);
            WriteOldFile(Path.Combine(ApplEnv.LogDirectory, "stale.log"), 2048);
            WriteTodayFile(Path.Combine(ApplEnv.LogDirectory, "fresh.log"), 5120);
        });

        Assert.Contains("#files=4/2/2", contents);
        Assert.Contains("size=12/9/3 kB", contents);
    }

    [Fact]
    public void Cleanup_Does_Not_Throw_When_First_Pass_Empties_Both_Directories()
    {
        var contents = RunCleanup(appName =>
        {
            WriteOldFile(Path.Combine(ApplEnv.TempDirectory, "stale.tmp"), 1024);
            WriteOldFile(Path.Combine(ApplEnv.LogDirectory, "stale.log"), 2048);
        });

        Assert.Contains("#files=2/0/2", contents);
        Assert.Contains("size=3/0/3 kB", contents);
    }

    private static void WriteOldFile(string path, int size)
    {
        File.WriteAllBytes(path, Enumerable.Repeat((byte)'x', size).ToArray());
        File.SetLastWriteTime(path, DateTime.Today.AddDays(-366).AddHours(12));
    }

    private static void WriteTodayFile(string path, int size)
    {
        File.WriteAllBytes(path, Enumerable.Repeat((byte)'y', size).ToArray());
        File.SetLastWriteTime(path, DateTime.Today.AddHours(12));
    }

    private static string RunCleanup(Action<string> seedFiles)
    {
        var appName = $"Oahu.Foundation.Tests.LogTmpFileMaintenance.{Guid.NewGuid():N}";
        var originalAppName = ApplEnv.ApplName;
        var logging = GetLoggingInstance();
        var originalLevel = GetLoggingLevel(logging);
        var originalInstantFlush = Logging.InstantFlush;
        string? testRoot = null;

        try
        {
            ApplEnv.OverrideApplName(appName);
            ResetLogging(logging);
            Logging.InstantFlush = true;
            SetLoggingLevel(logging, 2);
            testRoot = ApplEnv.LocalApplDirectory;

            Directory.CreateDirectory(ApplEnv.TempDirectory);
            Directory.CreateDirectory(ApplEnv.LogDirectory);

            seedFiles(appName);

            LogTmpFileMaintenance.Instance.Cleanup();

            var logFile = Assert.Single(Directory.GetFiles(ApplEnv.LogDirectory, $"{appName}_*.log"));
            return File.ReadAllText(logFile);
        }
        finally
        {
            Logging.InstantFlush = originalInstantFlush;
            SetLoggingLevel(logging, originalLevel);
            ResetLogging(logging);
            ApplEnv.OverrideApplName(originalAppName);
            ResetLogging(logging);

            if (testRoot is not null && Directory.Exists(testRoot))
            {
                Directory.Delete(testRoot, recursive: true);
            }
        }
    }

    private static object GetLoggingInstance() =>
        typeof(Logging).GetProperty("Instance", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;

    private static int GetLoggingLevel(object logging) =>
        (int)typeof(Logging).GetField("level", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(logging)!;

    private static void SetLoggingLevel(object logging, int level) =>
        typeof(Logging).GetField("level", BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(logging, level);

    private static void ResetLogging(object logging)
    {
        typeof(Logging).GetMethod("Close", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(logging, null);
        typeof(Logging).GetMethod("SetFileNameStub", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(logging, null);
    }
}
