// G# port of Server/UserDataLockTests.cs.
// Bitwise OR on enums works in 0.1.516, so Lock_Records_Pid test is recovered.

package Oahu.Cli.Tests.Server

import System
import System.Globalization
import System.IO
import System.Runtime.InteropServices
import Oahu.Cli.Server.Hosting
import Xunit

class UserDataLockTests {
    @Fact
    func Acquire_Then_Second_Acquire_Throws_On_Windows() {
        if !RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            return
        }
        var path = Path.Combine(Path.GetTempPath(), "oahu-lock-" + Guid.NewGuid().ToString("N"))
        using let first = UserDataLock(path)
        first.Acquire()

        using let second = UserDataLock(path)
        var threw = false
        try {
            second.Acquire()
        } catch (e InvalidOperationException) {
            threw = true
            Assert.Contains("already running", e.Message)
        }
        Assert.True(threw)
    }

    @Fact
    func Lock_Records_Pid_And_Cleans_Up_On_Dispose() {
        var path = Path.Combine(Path.GetTempPath(), "oahu-lock-" + Guid.NewGuid().ToString("N"))
        let first = UserDataLock(path)
        try {
            first.Acquire()
            Assert.True(File.Exists(path))

            using let fs = FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)
            using let sr = StreamReader(fs)
            let pid = sr.ReadToEnd().Trim()
            Assert.Equal(Environment.ProcessId.ToString(CultureInfo.InvariantCulture), pid)
        } finally {
            first.Dispose()
        }
        Assert.False(File.Exists(path))
    }

    @Fact
    func Acquire_Is_Idempotent_On_Same_Instance() {
        var path = Path.Combine(Path.GetTempPath(), "oahu-lock-" + Guid.NewGuid().ToString("N"))
        using let lk = UserDataLock(path)
        lk.Acquire()
        lk.Acquire()
        Assert.True(File.Exists(path))
    }
}
