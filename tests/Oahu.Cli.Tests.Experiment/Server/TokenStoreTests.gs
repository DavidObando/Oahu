// G# port of Server/TokenStoreTests.cs (PARTIAL).
//
// LIMITATION: G# 0.1.431 doesn't support bitwise OR/AND on enum types (GS0129),
// so the two Unix file mode tests are skipped (Token_File_Has_Restrictive_Mode_On_Unix,
// ReadOrCreate_Refuses_Loose_Mode).
// LIMITATION: Cannot pass null in InlineData for string? parameter.

package Oahu.Cli.Tests.Experiment.Server

import System
import System.IO
import Oahu.Cli.Server.Auth
import Xunit

type TokenStoreTests class {
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

    // SKIPPED: Token_File_Has_Restrictive_Mode_On_Unix — bitwise | on UnixFileMode enum not supported (GS0129).
    // SKIPPED: ReadOrCreate_Refuses_Loose_Mode — same bitwise enum limitation + File.SetUnixFileMode not binding.

    @Theory
    @InlineData("abc", "abc", true)
    @InlineData("abc", "abd", false)
    @InlineData("a", "ab", false)
    func Equal_Constant_Time_Compare(a string, b string, expected bool) {
        Assert.Equal(expected, TokenStore.Equal(a, b))
    }
}
