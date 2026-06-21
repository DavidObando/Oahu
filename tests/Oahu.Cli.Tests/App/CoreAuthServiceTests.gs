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
        for r in Enum.GetValues[CliRegion]() {
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

    init() {
        MfaAnswer = "000000"
        CvfAnswer = "0000"
        ExternalLoginAnswer = Uri("https://example.org/")
        ThrowNonInteractive = false
        MfaCalls = 0
        CaptchaAnswer = nil
        LastExternalLoginUri = nil
    }

    func SolveCaptchaAsync(challenge CaptchaChallenge, cancellationToken CancellationToken) Task[string] {
        return if ThrowNonInteractive {
            Task.FromException[string](NonInteractiveCallbackException("captcha"))
        } else if CaptchaAnswer != nil {
            Task.FromResult(CaptchaAnswer)
        } else {
            Task.FromResult(String.Empty)
        }
    }

    func SolveMfaAsync(challenge MfaChallenge, cancellationToken CancellationToken) Task[string] {
        MfaCalls++
        return if ThrowNonInteractive {
            Task.FromException[string](NonInteractiveCallbackException("mfa"))
        } else {
            Task.FromResult(MfaAnswer)
        }
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
    async func Bridge_Forwards_Mfa_Through_Broker() {
        let broker = CBRecordingBroker() { MfaAnswer = "987654" }
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, default(CancellationToken))

        // Run the synchronous callback off the test thread to mirror how Core
        // invokes it (typically inside Task.Run).
        let code = await Task.Run(() -> callbacks.MfaCallback())
        Assert.Equal("987654", code)
        Assert.Equal(1, broker.MfaCalls)
    }

    @Fact
    async func Bridge_Forwards_External_Login_Uri() {
        let loginUri = Uri("https://amazon.example/login")
        let redirect = Uri("https://audible.example/maplanding?code=xyz")
        let broker = CBRecordingBroker() { ExternalLoginAnswer = redirect }
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, default(CancellationToken))

        let result = await Task.Run(() -> callbacks.ExternalLoginCallback(loginUri))
        Assert.Equal(redirect, result)
        Assert.Equal(loginUri, broker.LastExternalLoginUri)
    }

    @Fact
    func Bridge_Always_Confirms_Deregister_Of_Previous_Device() {
        let broker = CBRecordingBroker()
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, default(CancellationToken))

        // Cli has no UI for "confirm de-register"; bridge default = true.
        let confirmed = callbacks.DeregisterDeviceConfirmCallback(
            ProfileKeyEx(0u, ERegion.Us, "name", "acct", "device")
        )
        Assert.True(confirmed)
    }

    @Fact
    async func Bridge_Propagates_NonInteractive_Exception() {
        let broker = CBRecordingBroker() { ThrowNonInteractive = true }
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, default(CancellationToken))

        let ex = await Assert.ThrowsAsync[NonInteractiveCallbackException](
            () -> Task.Run(() -> callbacks.MfaCallback())
        )
        Assert.Equal("mfa", ex.Kind)
    }
}
