package Oahu.Cli.App.Auth

import System
import System.IO
import System.Threading
import System.Threading.Tasks

/// Stdin-driven implementation of (cref:IAuthCallbackBroker). Prompts on
/// (cref:TextWriter) (defaults to (cref:Console.Error)) and reads from
/// (cref:TextReader) (defaults to (cref:Console.In)). In
/// non-interactive mode (stdin not a TTY, or `requireInteractive` wired by the
/// caller) every method throws (cref:NonInteractiveCallbackException) so
/// the CLI can surface a clear "missing input X" error rather than blocking forever.
class StdinCallbackBroker : IAuthCallbackBroker {
    private let reader TextReader
    private let writer TextWriter
    private let isInteractive bool

    init(reader TextReader? = nil, writer TextWriter? = nil, interactive bool? = nil) {
        this.reader = reader ?? Console.In
        this.writer = writer ?? Console.Error
        this.isInteractive = interactive ?? !Console.IsInputRedirected
    }

    func SolveCaptchaAsync(challenge CaptchaChallenge, cancellationToken CancellationToken) Task[string] {
        EnsureInteractive("captcha")
        writer.WriteLine("Audible CAPTCHA required.")
        writer.WriteLine("  (${challenge.ImageBytes.Length} bytes — open your browser to view, or use a TUI client.)")
        writer.Write("Enter CAPTCHA text: ")
        return ReadLineAsync("captcha", cancellationToken)
    }

    func SolveMfaAsync(challenge MfaChallenge, cancellationToken CancellationToken) Task[string] {
        EnsureInteractive("mfa")
        writer.Write("Enter MFA code: ")
        return ReadLineAsync("mfa", cancellationToken)
    }

    func SolveCvfAsync(challenge CvfChallenge, cancellationToken CancellationToken) Task[string] {
        EnsureInteractive("cvf")
        writer.Write("Enter CVF (account verification) code: ")
        return ReadLineAsync("cvf", cancellationToken)
    }

    func ConfirmApprovalAsync(challenge ApprovalChallenge, cancellationToken CancellationToken) Task {
        EnsureInteractive("approval")
        writer.WriteLine("Audible needs you to approve this sign-in via a notification on a trusted device.")
        writer.Write("Press Enter once approved... ")
        return ReadLineAsync("approval", cancellationToken)
    }

    async func CompleteExternalLoginAsync(challenge ExternalLoginChallenge, cancellationToken CancellationToken) Uri {
        EnsureInteractive("external-login")
        writer.WriteLine("Open this URL in a browser to sign in:")
        writer.WriteLine("  ${challenge.LoginUri}")
        writer.Write("Paste the final redirect URL: ")
        let line = await ReadLineAsync("external-login", cancellationToken).ConfigureAwait(false)
        if !Uri.TryCreate(line, UriKind.Absolute, out var uri) {
            throw InvalidOperationException("The pasted text is not a valid absolute URL.")
        }
        return uri
    }

    private func EnsureInteractive(kind string) {
        if !isInteractive {
            throw NonInteractiveCallbackException(kind)
        }
    }

    private async func ReadLineAsync(kind string, cancellationToken CancellationToken) string {
        cancellationToken.ThrowIfCancellationRequested()
        // TextReader.ReadLineAsync(CancellationToken) was added in net7+; works with both Console.In and StringReader.
        let line string? = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false)
        if line == nil {
            throw NonInteractiveCallbackException(kind)
        }
        return line.Trim()
    }
}

/// Thrown by callback brokers when the runtime cannot prompt the user (non-TTY, --no-prompt,
/// MCP-unattended).
class NonInteractiveCallbackException : Exception {
    init(kind string) : base(
        "Audible requires $kind input but no interactive prompt is available. Re-run with an interactive terminal, or use the TUI / GUI to complete sign-in."
    ) {
        Kind = kind
    }

    prop Kind string {
        get;
        init;
    }
}
