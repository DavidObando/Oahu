package Oahu.Cli.Tests.Server

import Oahu.Cli.Server.Hosting
import System
import System.Globalization
import System.IO
import System.Runtime.InteropServices
import Xunit

class UserDataLockTests {
    @Fact
    func Acquire_Then_Second_Acquire_Throws_On_Windows() {
        // FileShare exclusivity is only enforced by the OS on Windows. On Unix,
        // .NET's FileShare flags are advisory and not honored by the kernel, so
        // the second open succeeds. The lock file is still useful as a PID
        // marker on all platforms; cross-process exclusivity in CI is exercised
        // by the cooperative GUI/CLI design rather than this unit test.
        if !RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            return
        }
        let path = Path.Combine(Path.GetTempPath(), "oahu-lock-${Guid.NewGuid():n}")
        using let first = UserDataLock(path)
        first.Acquire()
        using let second = UserDataLock(path)
        let ex = Assert.Throws[InvalidOperationException](() -> second.Acquire())
        Assert.Contains("already running", ex.Message)
    }

    @Fact
    func Lock_Records_Pid_And_Cleans_Up_On_Dispose() {
        let path = Path.Combine(Path.GetTempPath(), "oahu-lock-${Guid.NewGuid():n}")
        {
            using let first = UserDataLock(path)
            first.Acquire()
            Assert.True(File.Exists(path))
            // The lock holder opens the file ReadWrite, so a concurrent reader
            // must permit FileShare.Write. File.ReadAllText doesn't, hence the
            // explicit FileStream + StreamReader here.
            using let fs = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)
            using let sr = StreamReader(fs)
            let pid = sr.ReadToEnd().Trim()
            Assert.Equal(Environment.ProcessId.ToString(CultureInfo.InvariantCulture), pid)
        }
        Assert.False(File.Exists(path))
    }

    @Fact
    func Acquire_Is_Idempotent_On_Same_Instance() {
        let path = Path.Combine(Path.GetTempPath(), "oahu-lock-${Guid.NewGuid():n}")
        using let lk = UserDataLock(path)
        lk.Acquire()
        lk.Acquire() // no-op, must not throw.
        Assert.True(File.Exists(path))
    }
}
