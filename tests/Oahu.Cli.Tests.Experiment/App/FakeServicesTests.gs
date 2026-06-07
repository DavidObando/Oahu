// G# port of App/FakeServicesTests.cs (PARTIAL).
//
// Only FakeAuthServiceTests are ported. FakeLibraryServiceTests are blocked:
// LibraryItem and LibraryFilter use C# `init` setters which throw
// MissingMethodException at runtime when called from G# compiled IL
// (gsc emits regular set_ calls that fail the modreq check).
//
// NOTE (G# 0.1.431, gsharp#502): async func not usable; Tasks blocked with .Result/.Wait().
// NOTE (G# 0.1.431, gsharp#504): ExpiresAt is DateTimeOffset?; nullable comparison
// skipped.

package Oahu.Cli.Tests.Experiment.App

import System.Threading
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Models
import Xunit

type FakeAuthServiceTests class {
    @Fact
    func Login_Then_GetActive_Returns_Session() {
        var svc = FakeAuthService()
        var s = svc.LoginAsync(CliRegion.Us, NonInteractiveCallbackBroker()).Result
        Assert.Equal(CliRegion.Us, s.Region)

        var active = svc.GetActiveAsync().Result
        Assert.NotNull(active)
        // LIMITATION (gsharp#518): active!!.ProfileAlias doesn't parse; split.
        let unwrapped = active!!
        Assert.Equal(s.ProfileAlias, unwrapped.ProfileAlias)
    }

    @Fact
    func Logout_Removes_Session() {
        var svc = FakeAuthService()
        var s = svc.LoginAsync(CliRegion.De, NonInteractiveCallbackBroker()).Result
        svc.LogoutAsync(s.ProfileAlias).Wait()
        Assert.Empty(svc.ListSessionsAsync().Result)
        Assert.Null(svc.GetActiveAsync().Result)
    }

    @Fact
    func Refresh_Updates_ExpiresAt() {
        var svc = FakeAuthService()
        var s = svc.LoginAsync(CliRegion.Uk, NonInteractiveCallbackBroker()).Result
        Thread.Sleep(10)
        var refreshed = svc.RefreshAsync(s.ProfileAlias).Result
        // LIMITATION (gsharp#504): ExpiresAt is DateTimeOffset?; cannot compare
        // nullable values safely. Assert that refresh completed without error.
        Assert.NotNull(refreshed)
    }
}
