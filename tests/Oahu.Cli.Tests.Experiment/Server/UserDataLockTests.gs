// G# port of Server/UserDataLockTests.cs (PARTIAL).
//
// LIMITATION: Lock_Records_Pid_And_Cleans_Up_On_Dispose requires FileShare bitwise OR
// (GS0129: Binary operator '|' not defined for enum types) — skipped.
// LIMITATION: Acquire_Then_Second_Acquire_Throws_On_Windows is Windows-only; early-returns
// on non-Windows.

package Oahu.Cli.Tests.Experiment.Server

import System
import System.IO
import System.Runtime.InteropServices
import Oahu.Cli.Server.Hosting
import Xunit

type UserDataLockTests class {
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

    // SKIPPED: Lock_Records_Pid_And_Cleans_Up_On_Dispose — requires FileShare.ReadWrite | FileShare.Delete
    // which uses bitwise OR on enum (GS0129).

    @Fact
    func Lock_Cleans_Up_On_Dispose() {
        var path = Path.Combine(Path.GetTempPath(), "oahu-lock-" + Guid.NewGuid().ToString("N"))
        var lk = UserDataLock(path)
        lk.Acquire()
        Assert.True(File.Exists(path))
        lk.Dispose()
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
