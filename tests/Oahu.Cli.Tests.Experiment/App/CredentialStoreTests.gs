// G# port of App/CredentialStoreTests.cs.
//
// Covers CredentialStoreFactory platform detection, UnsupportedCredentialStore
// throw behaviour, and (on Windows) the DPAPI round trip.

package Oahu.Cli.Tests.Experiment.App

import System
import System.IO
import System.Runtime.InteropServices
import Oahu.Cli.App.Credentials
import Xunit

type CredentialStoreTests class {
    @Fact
    func Factory_Returns_Platform_Appropriate_Store() {
        var id = Guid.NewGuid().ToString("N")
        var tempPath = Path.Combine(Path.GetTempPath(), "oahu-cli-creds-" + id)
        Directory.CreateDirectory(tempPath)
        try {
            var store = CredentialStoreFactory.Create(tempPath)
            if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                Assert.Equal("dpapi", store.Provider)
            } else if RuntimeInformation.IsOSPlatform(OSPlatform.OSX) {
                Assert.Equal("keychain", store.Provider)
            } else if RuntimeInformation.IsOSPlatform(OSPlatform.Linux) {
                Assert.Equal("secret-tool", store.Provider)
            }
        } finally {
            try {
                Directory.Delete(tempPath, true)
            } catch (e Exception) {
                // best-effort cleanup
            }
        }
    }

    @Fact
    func Unsupported_Store_Always_Throws_With_Reason() {
        var store = UnsupportedCredentialStore("test reason")
        Assert.Equal("unsupported", store.Provider)
        // UnsupportedCredentialStore throws synchronously before returning a Task.
        var ex = Assert.Throws[CredentialStoreUnavailableException](func() {
            store.GetAsync("acct")
        })
        Assert.Contains("test reason", ex.Message)
        Assert.Throws[CredentialStoreUnavailableException](func() {
            store.SetAsync("acct", "x")
        })
        Assert.Throws[CredentialStoreUnavailableException](func() {
            store.DeleteAsync("acct")
        })
        Assert.Throws[CredentialStoreUnavailableException](func() {
            store.ListAccountsAsync()
        })
    }

    @Fact
    func WindowsDpapi_Round_Trip() {
        if !RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            return
        }
        var id = Guid.NewGuid().ToString("N")
        var tempPath = Path.Combine(Path.GetTempPath(), "oahu-cli-creds-" + id)
        Directory.CreateDirectory(tempPath)
        try {
            let path = Path.Combine(tempPath, "creds.dpapi")
            let store = WindowsDpapiCredentialStore(path)
            store.SetAsync("alice", "s3cret").Wait()
            let got = store.GetAsync("alice").GetAwaiter().GetResult()
            Assert.Equal("s3cret", got)
            Assert.True(store.DeleteAsync("alice").Result)
            let after = store.GetAsync("alice").GetAwaiter().GetResult()
            Assert.Null(after)
            Assert.False(File.Exists(path + ".tmp"))
        } finally {
            try {
                Directory.Delete(tempPath, true)
            } catch (e Exception) {
                // best-effort cleanup
            }
        }
    }
}
