// G# port of App/CredentialStoreTests.cs.
//
// Covers CredentialStoreFactory platform detection, UnsupportedCredentialStore
// throw behaviour, and (on Windows) the DPAPI round trip.

package Oahu.Cli.Tests.App

import System
import System.IO
import System.Runtime.InteropServices
import Oahu.Cli.App.Credentials
import Xunit

class TempDir : IDisposable {
    prop Path string { get; private set; }

    init() {
        Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "oahu-cli-creds-${Guid.NewGuid():N}")
        Directory.CreateDirectory(Path)
    }

    func Dispose() {
        try {
            Directory.Delete(Path, recursive: true)
        } catch (e Exception) {
            // best-effort cleanup
        }
    }
}

class CredentialStoreTests {
    @Fact
    func Factory_Returns_Platform_Appropriate_Store() {
        using let tempDir = TempDir()
        var store = CredentialStoreFactory.Create(tempDir.Path)
        if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            Assert.Equal("dpapi", store.Provider)
        } else if RuntimeInformation.IsOSPlatform(OSPlatform.OSX) {
            Assert.Equal("keychain", store.Provider)
        } else if RuntimeInformation.IsOSPlatform(OSPlatform.Linux) {
            Assert.Equal("secret-tool", store.Provider)
        }
    }

    @Fact
    async func Unsupported_Store_Always_Throws_With_Reason() {
        var store = UnsupportedCredentialStore("test reason")
        Assert.Equal("unsupported", store.Provider)
        var ex = await Assert.ThrowsAsync[CredentialStoreUnavailableException](
            () -> store.GetAsync("acct"))
        Assert.Contains("test reason", ex.Message)
        await Assert.ThrowsAsync[CredentialStoreUnavailableException](
            () -> store.SetAsync("acct", "x"))
        await Assert.ThrowsAsync[CredentialStoreUnavailableException](
            () -> store.DeleteAsync("acct"))
        await Assert.ThrowsAsync[CredentialStoreUnavailableException](
            () -> store.ListAccountsAsync())
    }

    @Fact
    async func WindowsDpapi_Round_Trip() {
        if !RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            return
        }
        using let tempDir = TempDir()
        let path = Path.Combine(tempDir.Path, "creds.dpapi")
        let store = WindowsDpapiCredentialStore(path)
        await store.SetAsync("alice", "s3cret")
        Assert.Equal("s3cret", await store.GetAsync("alice"))
        Assert.True(await store.DeleteAsync("alice"))
        Assert.Null(await store.GetAsync("alice"))
        Assert.False(File.Exists(path + ".tmp"))
    }
}
