// G# port of App/CredentialStoreTests.cs.
//
// Covers CredentialStoreFactory platform detection and UnsupportedCredentialStore
// throw behaviour. WindowsDpapi_Round_Trip is skipped on non-Windows.
//
// NOTE (G# 0.1.431, gsharp#502): async func not usable; Tasks blocked with .Result/.Wait().
// LIMITATION: G# cannot bind .Result on Task[string?] (nullable type param).
// UnsupportedCredentialStore throws synchronously so .Result is not needed.
// WindowsDpapi_Round_Trip skipped: cannot call .Result on Task[string?].

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
}
