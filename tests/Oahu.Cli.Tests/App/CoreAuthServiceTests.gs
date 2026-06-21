// G# port of App/CoreAuthServiceTests.cs.
//
// Recovery (0.1.516): added All_Cli_Regions_Round_Trip and the four
// CallbackBridge tests (broker-implementation + invoking Func/Action fields
// on Oahu.Core.Callbacks now bind correctly).

package Oahu.Cli.Tests.App

import System
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Models
import Oahu.CommonTypes
import Oahu.Core
import Xunit

class CoreAuthRegionMappingTests {
    @Theory
    @InlineData(CliRegion.Us, ERegion.Us)
    @InlineData(CliRegion.Uk, ERegion.Uk)
    @InlineData(CliRegion.De, ERegion.De)
    @InlineData(CliRegion.Fr, ERegion.Fr)
    @InlineData(CliRegion.It, ERegion.It)
    @InlineData(CliRegion.Es, ERegion.Es)
    @InlineData(CliRegion.Jp, ERegion.Jp)
    @InlineData(CliRegion.Au, ERegion.Au)
    @InlineData(CliRegion.Ca, ERegion.Ca)
    @InlineData(CliRegion.In, ERegion.In)
    @InlineData(CliRegion.Br, ERegion.Br)
    func Region_Maps_Both_Directions(cli CliRegion, core ERegion) {
        Assert.Equal(core, CoreAuthService.ToCoreRegion(cli))
        Assert.Equal(cli, CoreAuthService.ToCliRegion(core))
    }

    @Fact
    func All_Cli_Regions_Round_Trip() {
        let values = Enum.GetValues[CliRegion]()
        for r in values {
            let roundTripped = CoreAuthService.ToCliRegion(CoreAuthService.ToCoreRegion(r))
            Assert.Equal(r, roundTripped)
        }
    }
}

class CBRecordingBroker : IAuthCallbackBroker {
    prop CaptchaAnswer string?
    prop MfaAnswer string
    prop CvfAnswer string
    prop ExternalLoginAnswer Uri
    prop ThrowNonInteractive bool

    prop MfaCalls int32
    prop LastExternalLoginUri Uri?

    func init() {
        MfaAnswer = "000000"
        CvfAnswer = "0000"
        ExternalLoginAnswer = Uri("https://example.org/")
        ThrowNonInteractive = false
        MfaCalls = 0
        CaptchaAnswer = nil
        LastExternalLoginUri = nil
    }

    func SolveCaptchaAsync(challenge CaptchaChallenge, cancellationToken CancellationToken) Task[string] {
        if ThrowNonInteractive {
            return Task.FromException[string](NonInteractiveCallbackException("captcha"))
        }
        var answer = ""
        if CaptchaAnswer != nil {
            answer = CaptchaAnswer!!
        }
        return Task.FromResult(answer)
    }

    func SolveMfaAsync(challenge MfaChallenge, cancellationToken CancellationToken) Task[string] {
        MfaCalls = MfaCalls + 1
        if ThrowNonInteractive {
            return Task.FromException[string](NonInteractiveCallbackException("mfa"))
        }
        return Task.FromResult(MfaAnswer)
    }

    func SolveCvfAsync(challenge CvfChallenge, cancellationToken CancellationToken) Task[string] {
        return Task.FromResult(CvfAnswer)
    }

    func ConfirmApprovalAsync(challenge ApprovalChallenge, cancellationToken CancellationToken) Task {
        return Task.CompletedTask
    }

    func CompleteExternalLoginAsync(challenge ExternalLoginChallenge, cancellationToken CancellationToken) Task[Uri] {
        LastExternalLoginUri = challenge.LoginUri
        return Task.FromResult(ExternalLoginAnswer)
    }
}

class CallbackBridgeTests {
    @Fact
    func Bridge_Forwards_Mfa_Through_Broker() {
        var bb = CBRecordingBroker() { MfaAnswer = "987654" }
        let broker IAuthCallbackBroker = bb
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, CancellationToken.None)

        let mfa = callbacks.MfaCallback
        let code = Task.Run[string](func() string { return mfa() }).Result
        Assert.Equal("987654", code)
        Assert.Equal(1, bb.MfaCalls)
    }

    @Fact
    func Bridge_Forwards_External_Login_Uri() {
        let loginUri = Uri("https://amazon.example/login")
        let redirect = Uri("https://audible.example/maplanding?code=xyz")
        var bb = CBRecordingBroker() { ExternalLoginAnswer = redirect }
        let broker IAuthCallbackBroker = bb
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, CancellationToken.None)

        let ext = callbacks.ExternalLoginCallback
        let result = Task.Run[Uri](func() Uri { return ext(loginUri) }).Result
        Assert.Equal(redirect, result)
        Assert.Equal(loginUri, bb.LastExternalLoginUri)
    }

    @Fact
    func Bridge_Always_Confirms_Deregister_Of_Previous_Device() {
        var bb = CBRecordingBroker()
        let broker IAuthCallbackBroker = bb
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, CancellationToken.None)

        let deregister = callbacks.DeregisterDeviceConfirmCallback
        let key = ProfileKeyEx(uint32(0), ERegion.Us, "name", "acct", "device")
        let confirmed = deregister(key)
        Assert.True(confirmed)
    }

    @Fact
    func Bridge_Propagates_NonInteractive_Exception() {
        var bb = CBRecordingBroker() { ThrowNonInteractive = true }
        let broker IAuthCallbackBroker = bb
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, CancellationToken.None)

        let mfa = callbacks.MfaCallback
        let agg = Assert.Throws[AggregateException](func() {
            let ignored = Task.Run[string](func() string { return mfa() }).Result
        })
        let ex = Assert.IsType[NonInteractiveCallbackException](agg.InnerException)
        Assert.Equal("mfa", ex.Kind)
    }
}
