package Oahu.Cli.Tests.App

import System
import System.IO
import System.Threading
import Oahu.Cli.App.Auth
import Xunit

/// Covers StdinCallbackBroker (MFA trimming, external-login URI, invalid URL,
/// non-interactive throw) and NonInteractiveCallbackBroker (always throws).
class CallbackBrokerTests {
    @Fact
    async func Stdin_Broker_Pipes_Mfa_Code_Trimmed() {
        using let input = StringReader("  123456  \n")
        let output = StringWriter()
        let broker = StdinCallbackBroker(input, output, true)

        let code = await broker.SolveMfaAsync(MfaChallenge(), default(CancellationToken))
        Assert.Equal("123456", code)
        Assert.Contains("Enter MFA code", output.ToString())
    }

    @Fact
    async func Stdin_Broker_External_Login_Returns_Pasted_Uri() {
        let login = ExternalLoginChallenge(Uri("https://amazon.example/login"))
        using let input = StringReader("https://audible.example/maplanding?code=abc\n")
        let broker = StdinCallbackBroker(input, StringWriter(), true)

        let uri = await broker.CompleteExternalLoginAsync(login, default(CancellationToken))
        Assert.Equal("audible.example", uri.Host)
    }

    @Fact
    async func Stdin_Broker_External_Login_Throws_On_Invalid_Url() {
        let login = ExternalLoginChallenge(Uri("https://amazon.example/login"))
        using let input = StringReader("not a url\n")
        let broker = StdinCallbackBroker(input, StringWriter(), interactive: true)
        await Assert.ThrowsAsync[InvalidOperationException](() -> broker.CompleteExternalLoginAsync(login, default(CancellationToken)))
    }

    @Fact
    async func Non_Interactive_Stdin_Throws_NonInteractiveCallbackException() {
        using let input = StringReader("")
        let broker = StdinCallbackBroker(input, StringWriter(), interactive: false)
        let ex = await Assert.ThrowsAsync[NonInteractiveCallbackException](
            () -> broker.SolveCaptchaAsync(CaptchaChallenge([]byte{byte(1)}), default(CancellationToken)))
        Assert.Equal("captcha", ex.Kind)
    }

    @Fact
    async func NonInteractive_Broker_Always_Throws() {
        let broker = NonInteractiveCallbackBroker()
        await Assert.ThrowsAsync[NonInteractiveCallbackException](
            () -> broker.SolveMfaAsync(MfaChallenge(), default(CancellationToken)))
        await Assert.ThrowsAsync[NonInteractiveCallbackException](
            () -> broker.SolveCvfAsync(CvfChallenge(), default(CancellationToken)))
        await Assert.ThrowsAsync[NonInteractiveCallbackException](
            () -> broker.ConfirmApprovalAsync(ApprovalChallenge(), default(CancellationToken)))
    }
}
