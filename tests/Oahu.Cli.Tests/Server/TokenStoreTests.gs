// G# port of Server/TokenStoreTests.cs.
// Bitwise OR on enums works in 0.1.516, so Unix-mode tests are recovered.

package Oahu.Cli.Tests.Server

import System
import System.IO
import System.Runtime.InteropServices
import Oahu.Cli.Server.Auth
import Xunit

class TokenStoreTests {
    @Fact
    func ReadOrCreate_Generates_Then_Reuses_Token() {
        var path = Path.Combine(Path.GetTempPath(), "oahu-token-" + Guid.NewGuid().ToString("N"))
        try {
            var store = TokenStore(path)
            var first = store.ReadOrCreate()
            Assert.False(String.IsNullOrWhiteSpace(first))
            Assert.True(File.Exists(path))
            var second = store.ReadOrCreate()
            Assert.Equal(first, second)
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }

    @Fact
    func Rotate_Replaces_Token() {
        var path = Path.Combine(Path.GetTempPath(), "oahu-token-" + Guid.NewGuid().ToString("N"))
        try {
            var store = TokenStore(path)
            var first = store.ReadOrCreate()
            var second = store.Rotate()
            Assert.NotEqual(first, second)
            Assert.Equal(second, store.ReadOrCreate())
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }

    @Fact
    func Token_File_Has_Restrictive_Mode_On_Unix() {
        if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            return
        }
        var path = Path.Combine(Path.GetTempPath(), "oahu-token-" + Guid.NewGuid().ToString("N"))
        try {
            TokenStore(path).ReadOrCreate()
            var mode = File.GetUnixFileMode(path)
            let forbidden = UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute |
                            UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute
            Assert.Equal(UnixFileMode(0), mode & forbidden)
            let userRw = UnixFileMode.UserRead | UnixFileMode.UserWrite
            Assert.Equal(userRw, mode & userRw)
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }

    @Fact
    func ReadOrCreate_Refuses_Loose_Mode() {
        if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            return
        }
        var path = Path.Combine(Path.GetTempPath(), "oahu-token-" + Guid.NewGuid().ToString("N"))
        try {
            File.WriteAllText(path, "abcdef")
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.OtherRead)
            let store = TokenStore(path)
            Assert.Throws[InvalidOperationException](func() { store.ReadOrCreate() })
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }

    @Theory
    @InlineData("abc", "abc", true)
    @InlineData("abc", "abd", false)
    @InlineData("a", "ab", false)
    @InlineData(nil, "abc", false)
    func Equal_Constant_Time_Compare(a string?, b string?, expected bool) {
        Assert.Equal(expected, TokenStore.Equal(a, b))
    }
}
