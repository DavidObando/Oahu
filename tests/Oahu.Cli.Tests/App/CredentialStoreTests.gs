package Oahu.Cli.Tests.App

import Oahu.Cli.App.Credentials
import System
import System.IO
import System.Runtime.InteropServices
import System.Runtime.Versioning
import System.Threading.Tasks
import Xunit

class CredentialStoreTests {
    @Fact
    func Factory_Returns_Platform_Appropriate_Store() {
        using let tempDir = TempDir()
        let store = CredentialStoreFactory.Create(tempDir.Path)
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
        let store = UnsupportedCredentialStore("test reason")
        Assert.Equal("unsupported", store.Provider)
        let ex = await Assert.ThrowsAsync[CredentialStoreUnavailableException](
            func () Task {
                return store.GetAsync("acct")
            }
        )
        Assert.Contains("test reason", ex.Message)
        await Assert.ThrowsAsync[CredentialStoreUnavailableException](() -> store.SetAsync("acct", "x"))
        await Assert.ThrowsAsync[CredentialStoreUnavailableException](
            func () Task {
                return store.DeleteAsync("acct")
            }
        )
        await Assert.ThrowsAsync[CredentialStoreUnavailableException](
            func () Task {
                return store.ListAccountsAsync()
            }
        )
    }

    @Fact
    @System.Runtime.Versioning.SupportedOSPlatform("windows")
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

    private class TempDir : IDisposable {
        init() {
            Path = Path.Combine(Path.GetTempPath(), "oahu-cli-creds-${Guid.NewGuid():n}")
            Directory.CreateDirectory(Path)
        }

        prop Path string {
            get;
            init;
        }

        func Dispose() {
            try {
                Directory.Delete(Path, recursive: true)
            } catch {
                // best-effort cleanup

            }
        }
    }
}
