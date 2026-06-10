// Sanity tests for ExpFakeAuthService and ExpNonInteractiveCallbackBroker.

package Oahu.Cli.Tests.Experiment.Auth

import Xunit
import System
import System.Threading
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Models
import Oahu.Cli.App.Experiment.Auth

type ExpFakeAuthServiceTests class {
    @Fact
    func List_Empty_When_New() {
        var svc = ExpFakeAuthService()
        var lst = svc.ListSessionsAsync(CancellationToken.None).Result
        Assert.Equal[int32](0, lst.Count)
    }

    @Fact
    func Login_Adds_Session() {
        var svc = ExpFakeAuthService()
        var broker = ExpNonInteractiveCallbackBroker()
        var s = svc.LoginAsync(CliRegion.Us, broker, false, CancellationToken.None).Result
        Assert.Equal("us-fake", s.ProfileAlias)
        Assert.Equal[int32](1, svc.ListSessionsAsync(CancellationToken.None).Result.Count)
    }

    @Fact
    func GetActive_Returns_Logged_In_Profile() {
        var svc = ExpFakeAuthService()
        var broker = ExpNonInteractiveCallbackBroker()
        svc.LoginAsync(CliRegion.Uk, broker, false, CancellationToken.None).Wait()
        var active = svc.GetActiveAsync(CancellationToken.None).Result
        Assert.NotNull(active)
        Assert.Equal("uk-fake", active!!.ProfileAlias)
    }

    @Fact
    func Logout_Removes_Session() {
        var svc = ExpFakeAuthService()
        var broker = ExpNonInteractiveCallbackBroker()
        svc.LoginAsync(CliRegion.De, broker, false, CancellationToken.None).Wait()
        svc.LogoutAsync("de-fake", CancellationToken.None).Wait()
        Assert.Equal[int32](0, svc.ListSessionsAsync(CancellationToken.None).Result.Count)
    }

    @Fact
    func Refresh_Updates_ExpiresAt() {
        var svc = ExpFakeAuthService()
        var broker = ExpNonInteractiveCallbackBroker()
        var s1 = svc.LoginAsync(CliRegion.Jp, broker, false, CancellationToken.None).Result
        var s2 = svc.RefreshAsync("jp-fake", CancellationToken.None).Result
        Assert.Equal(s1.ProfileAlias, s2.ProfileAlias)
        Assert.NotNull(s2.ExpiresAt)
    }

    @Fact
    func Implements_Interface() {
        var svc = ExpFakeAuthService()
        Assert.IsAssignableFrom[IAuthService](svc)
    }
}

type ExpNonInteractiveCallbackBrokerTests class {
    @Fact
    func Mfa_Throws() {
        var b = ExpNonInteractiveCallbackBroker()
        var t = b.SolveMfaAsync(MfaChallenge(), CancellationToken.None)
        Assert.True(t.IsFaulted)
    }

    @Fact
    func Captcha_Throws() {
        var b = ExpNonInteractiveCallbackBroker()
        var bytes = Array.Empty[uint8]()
        var t = b.SolveCaptchaAsync(CaptchaChallenge(bytes), CancellationToken.None)
        Assert.True(t.IsFaulted)
    }

    @Fact
    func Approval_Throws() {
        var b = ExpNonInteractiveCallbackBroker()
        var t = b.ConfirmApprovalAsync(ApprovalChallenge(), CancellationToken.None)
        Assert.True(t.IsFaulted)
    }

    @Fact
    func Implements_Interface() {
        var b = ExpNonInteractiveCallbackBroker()
        Assert.IsAssignableFrom[IAuthCallbackBroker](b)
    }
}
