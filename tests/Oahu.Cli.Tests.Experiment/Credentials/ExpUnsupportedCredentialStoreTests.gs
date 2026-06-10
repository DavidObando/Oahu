// Sanity tests for ExpUnsupportedCredentialStore.

package Oahu.Cli.Tests.Experiment.Credentials

import Xunit
import System
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Experiment.Credentials

type ExpUnsupportedCredentialStoreTests class {
    @Fact
    func Provider_Is_Unsupported() {
        var s = ExpUnsupportedCredentialStore() { Reason = "no keyring" }
        Assert.Equal("unsupported", s.Provider())
    }

    @Fact
    func Get_Throws() {
        var s = ExpUnsupportedCredentialStore() { Reason = "x" }
        var t = s.GetAsync("a", CancellationToken.None)
        Assert.True(t.IsFaulted)
    }

    @Fact
    func Set_Throws() {
        var s = ExpUnsupportedCredentialStore() { Reason = "x" }
        var t = s.SetAsync("a", "b", CancellationToken.None)
        Assert.True(t.IsFaulted)
    }

    @Fact
    func Delete_Throws() {
        var s = ExpUnsupportedCredentialStore() { Reason = "x" }
        var t = s.DeleteAsync("a", CancellationToken.None)
        Assert.True(t.IsFaulted)
    }

    @Fact
    func List_Throws() {
        var s = ExpUnsupportedCredentialStore() { Reason = "x" }
        var t = s.ListAccountsAsync(CancellationToken.None)
        Assert.True(t.IsFaulted)
    }

    @Fact
    func Implements_Interface() {
        var s = ExpUnsupportedCredentialStore() { Reason = "x" }
        Assert.IsAssignableFrom[IExpCredentialStore](s)
    }
}
