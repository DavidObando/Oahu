// G# port of App/CallbackBrokerTests.cs.
//
// Covers StdinCallbackBroker (MFA trimming, external-login URI, invalid URL,
// non-interactive throw) and NonInteractiveCallbackBroker (always throws).
//
// NOTE (G# 0.1.431, gsharp#502): async func not usable; all awaited Tasks
// replaced with .Result blocking calls.
//
// ANOMALY: G# 0.1.431 does not interpret \n as a newline escape in
// double-quoted strings; it is treated as literal backslash + 'n'.
// Workaround: construct newline via char(10).

package Oahu.Cli.Tests.App

import System
import System.IO
import System.Threading
import Oahu.Cli.App.Auth
import Xunit

func linefeed() string {
    return String([]char{char(10)})
}

class CallbackBrokerTests {
    @Fact
    func Stdin_Broker_Pipes_Mfa_Code_Trimmed() {
        using let input = StringReader("  123456  " + linefeed())
        var output = StringWriter()
        var broker = StdinCallbackBroker(input, output, true)

        var code = broker.SolveMfaAsync(MfaChallenge(), CancellationToken.None).Result
        Assert.Equal("123456", code)
        Assert.Contains("Enter MFA code", output.ToString())
    }

    @Fact
    func Stdin_Broker_External_Login_Returns_Pasted_Uri() {
        var login = ExternalLoginChallenge(Uri("https://amazon.example/login"))
        using let input = StringReader("https://audible.example/maplanding?code=abc" + linefeed())
        var broker = StdinCallbackBroker(input, StringWriter(), true)

        var uri = broker.CompleteExternalLoginAsync(login, CancellationToken.None).Result
        Assert.Equal("audible.example", uri.Host)
    }

    @Fact
    func Stdin_Broker_External_Login_Throws_On_Invalid_Url() {
        var login = ExternalLoginChallenge(Uri("https://amazon.example/login"))
        using let input = StringReader("not a url" + linefeed())
        var broker = StdinCallbackBroker(input, StringWriter(), true)
        Assert.Throws[AggregateException](func() {
            var ignored = broker.CompleteExternalLoginAsync(login, CancellationToken.None).Result
        })
    }

    @Fact
    func Non_Interactive_Stdin_Throws_NonInteractiveCallbackException() {
        using let input = StringReader("")
        var broker = StdinCallbackBroker(input, StringWriter(), false)
        var ex = Assert.Throws[NonInteractiveCallbackException](func() {
            broker.SolveCaptchaAsync(CaptchaChallenge([]uint8{uint8(1)}), CancellationToken.None).Result
        })
        Assert.Equal("captcha", ex.Kind)
    }

    @Fact
    func NonInteractive_Broker_Always_Throws() {
        var broker = NonInteractiveCallbackBroker()
        Assert.Throws[NonInteractiveCallbackException](func() {
            broker.SolveMfaAsync(MfaChallenge(), CancellationToken.None).Result
        })
        Assert.Throws[NonInteractiveCallbackException](func() {
            broker.SolveCvfAsync(CvfChallenge(), CancellationToken.None).Result
        })
        Assert.Throws[NonInteractiveCallbackException](func() {
            broker.ConfirmApprovalAsync(ApprovalChallenge(), CancellationToken.None).Wait()
        })
    }
}
