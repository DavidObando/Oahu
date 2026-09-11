package Oahu.Cli.Tests.App

import Oahu.Cli.App.Auth
import Oahu.Cli.App.Models
import Oahu.CommonTypes
import Oahu.Core
import System
import System.Threading
import System.Threading.Tasks
import Xunit

class CoreAuthRegionMappingTests {
    @Theory
    @InlineData(0, 1)
    @InlineData(1, 2)
    @InlineData(2, 0)
    @InlineData(3, 3)
    @InlineData(4, 5)
    @InlineData(5, 9)
    @InlineData(6, 8)
    @InlineData(7, 6)
    @InlineData(8, 4)
    @InlineData(9, 7)
    @InlineData(10, 10)
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

class CallbackBridgeTests {
    @Fact
    async func Bridge_Forwards_Mfa_Through_Broker() {
        let broker = RecordingBroker{MfaAnswer: "987654"}
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, default(CancellationToken))
        // Run the synchronous callback off the test thread to mirror how Core
        // invokes it (typically inside Task.Run).
        let code = await Task.Run(() -> callbacks.MfaCallback!!())
        Assert.Equal("987654", code)
        Assert.Equal(1, broker.MfaCalls)
    }

    @Fact
    async func Bridge_Forwards_External_Login_Uri() {
        let loginUri = Uri("https://amazon.example/login")
        let redirect = Uri("https://audible.example/maplanding?code=xyz")
        let broker = RecordingBroker{ExternalLoginAnswer: redirect}
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, default(CancellationToken))
        let result = await Task.Run(() -> callbacks.ExternalLoginCallback!!(loginUri))
        Assert.Equal(redirect, result)
        Assert.Equal(loginUri, broker.LastExternalLoginUri)
    }

    @Fact
    func Bridge_Always_Confirms_Deregister_Of_Previous_Device() {
        let broker = RecordingBroker()
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, default(CancellationToken))
        // Cli has no UI for "confirm de-register"; bridge default = true.
        let confirmed = callbacks.DeregisterDeviceConfirmCallback(
            ProfileKeyEx(0u, ERegion.Us, "name", "acct", "device")
        )
        Assert.True(confirmed)
    }

    @Fact
    async func Bridge_Propagates_NonInteractive_Exception() {
        let broker = RecordingBroker{ThrowNonInteractive: true}
        let callbacks = CallbackBridge.ToCoreCallbacks(broker, default(CancellationToken))
        let ex = await Assert.ThrowsAsync[NonInteractiveCallbackException](
            func () Task {
                return Task.Run(() -> callbacks.MfaCallback!!())
            }
        )
        Assert.Equal("mfa", ex.Kind)
    }

    private class RecordingBroker : IAuthCallbackBroker {
        init() {
            MfaAnswer = "000000"
            CvfAnswer = "0000"
            ExternalLoginAnswer = Uri("https://example.org/")
        }

        prop CaptchaAnswer string? {
            get;
            init;
        }

        prop MfaAnswer string {
            get;
            init;
        }

        prop CvfAnswer string {
            get;
            init;
        }

        prop ExternalLoginAnswer Uri {
            get;
            init;
        }

        prop ThrowNonInteractive bool {
            get;
            init;
        }

        prop MfaCalls int32 {
            get;
            private set;
        }

        prop LastExternalLoginUri Uri? {
            get;
            private set;
        }

        func SolveCaptchaAsync(challenge CaptchaChallenge, cancellationToken CancellationToken) Task[
            string
        ] -> if ThrowNonInteractive {
            Task.FromException[string](NonInteractiveCallbackException("captcha"))
        } else {
            Task.FromResult(CaptchaAnswer ?? string.Empty)
        }

        func SolveMfaAsync(challenge MfaChallenge, cancellationToken CancellationToken) Task[string] {
            MfaCalls++
            return if ThrowNonInteractive {
                Task.FromException[string](NonInteractiveCallbackException("mfa"))
            } else {
                Task.FromResult(MfaAnswer)
            }
        }

        func SolveCvfAsync(challenge CvfChallenge, cancellationToken CancellationToken) Task[string] -> Task.FromResult(
            CvfAnswer
        )

        func ConfirmApprovalAsync(
            challenge ApprovalChallenge,
            cancellationToken CancellationToken
        ) Task -> Task.CompletedTask

        func CompleteExternalLoginAsync(challenge ExternalLoginChallenge, cancellationToken CancellationToken) Task[
            Uri
        ] {
            LastExternalLoginUri = challenge.LoginUri
            return Task.FromResult(ExternalLoginAnswer)
        }
    }
}
