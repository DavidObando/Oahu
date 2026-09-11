package Oahu.Cli.Tests.Server

import Oahu.Cli.Server.Auth
import System
import System.IO
import System.Runtime.InteropServices
import Xunit

class TokenStoreTests {
    @Fact
    func ReadOrCreate_Generates_Then_Reuses_Token() {
        let path = Path.Combine(Path.GetTempPath(), "oahu-token-${Guid.NewGuid():n}")
        try {
            let store = TokenStore(path)
            let first = store.ReadOrCreate()
            Assert.False(string.IsNullOrWhiteSpace(first))
            Assert.True(File.Exists(path))
            let second = store.ReadOrCreate()
            Assert.Equal(first, second)
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }

    @Fact
    func Rotate_Replaces_Token() {
        let path = Path.Combine(Path.GetTempPath(), "oahu-token-${Guid.NewGuid():n}")
        try {
            let store = TokenStore(path)
            let first = store.ReadOrCreate()
            let second = store.Rotate()
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
        let path = Path.Combine(Path.GetTempPath(), "oahu-token-${Guid.NewGuid():n}")
        try {
            TokenStore(path).ReadOrCreate()
            let mode = File.GetUnixFileMode(path)
            const forbidden = UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute
            Assert.Equal(UnixFileMode(0), mode & forbidden)
            Assert.Equal(
                UnixFileMode.UserRead | UnixFileMode.UserWrite,
                mode & (UnixFileMode.UserRead | UnixFileMode.UserWrite)
            )
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
        let path = Path.Combine(Path.GetTempPath(), "oahu-token-${Guid.NewGuid():n}")
        try {
            File.WriteAllText(path, "abcdef")
            File.SetUnixFileMode(
                path,
                UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.OtherRead
            )
            Assert.Throws[InvalidOperationException](
                func () object? {
                    return TokenStore(path).ReadOrCreate()
                }
            )
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
