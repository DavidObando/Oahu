package Oahu.Cli.App.Credentials

import System
import System.Collections.Generic
import System.ComponentModel
import System.Diagnostics
import System.IO
import System.Linq
import System.Runtime.Versioning
import System.Threading
import System.Threading.Tasks

/// Linux Secret-Service-backed store driven by `secret-tool` (libsecret).
/// Requires a running secret-service daemon (gnome-keyring, KWallet's secret-service
/// bridge, KeePassXC, …) and a DBus session; missing tools / daemons surface as
/// (cref:CredentialStoreUnavailableException) via the factory.
@SupportedOSPlatform("linux")
class LinuxSecretToolCredentialStore : ICredentialStore {
    private let serviceName string
    private let secretTool string

    init(serviceName string? = nil, secretToolPath string? = nil) {
        this.serviceName = serviceName ?? DefaultService
        this.secretTool = secretToolPath ?? "secret-tool"
    }

    prop Provider string -> "secret-tool"

    async func GetAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) string? {
        ArgumentException.ThrowIfNullOrWhiteSpace(account)
        let (code, stdout, _) = await RunAsync(
            []string{"lookup", SchemaService, serviceName, SchemaAccount, account},
            stdin: nil,
            cancellationToken
        ).ConfigureAwait(false)
        if code != 0 {
            return nil // secret-tool returns non-zero when the entry is missing.

        }
        return stdout.TrimEnd('\n', '\r')
    }

    async func SetAsync(
        account string,
        secret string,
        cancellationToken CancellationToken = default(CancellationToken)
    ) {
        ArgumentException.ThrowIfNullOrWhiteSpace(account)
        ArgumentNullException.ThrowIfNull(secret)
        let (code, _, stderr) = await RunAsync(
            []string{"store", "--label", "$serviceName ($account)", SchemaService, serviceName, SchemaAccount, account},
            stdin: secret,
            cancellationToken
        ).ConfigureAwait(false)
        if code != 0 {
            throw CredentialStoreOperationException("store: ${stderr.Trim()}", code)
        }
    }

    async func DeleteAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) bool {
        ArgumentException.ThrowIfNullOrWhiteSpace(account)
        let (code, _, _) = await RunAsync(
            []string{"clear", SchemaService, serviceName, SchemaAccount, account},
            stdin: nil,
            cancellationToken
        ).ConfigureAwait(false)
        return code == 0
    }

    func ListAccountsAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[
        IReadOnlyList[string]
    ] {
        // secret-tool has no "search by attribute" with an iterable result; defer to Phase 4.
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult[IReadOnlyList[string]](Array.Empty[string]())
    }

    private async func RunAsync(args[]string, stdin string?, ct CancellationToken)(
        Code int32,
        StdOut string,
        StdErr string
    ) {
        let psi = ProcessStartInfo(secretTool){
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = stdin != nil,
            UseShellExecute = false,
            CreateNoWindow = true
        }
        for a in args {
            psi.ArgumentList.Add(a)
        }
        // Bound the wait so a hung secret-service daemon (e.g., DBus stuck, KWallet
        // prompt that nobody answers) cannot deadlock the CLI forever.
        using let timeoutCts = CancellationTokenSource(DefaultTimeout)
        using let linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token)
        let token = linkedCts.Token
        var proc Process
        try {
            proc = Process.Start(psi) ?? throw CredentialStoreUnavailableException("Could not start $secretTool.")
        } catch (ex Win32Exception) {
            throw CredentialStoreUnavailableException("$secretTool is not installed: ${ex.Message}")
        }
        {
            using let _ = proc
            if stdin != nil {
                try {
                    await proc.StandardInput.WriteAsync(stdin.AsMemory(), token).ConfigureAwait(false)
                } finally {
                    // Close stdin even if WriteAsync threw; otherwise secret-tool blocks
                    // forever waiting for EOF and the WaitForExit below times out.
                    try {
                        proc.StandardInput.Close()
                    } catch {
                        // best-effort

                    }
                }
            }
            let stdoutTask = proc.StandardOutput.ReadToEndAsync(token)
            let stderrTask = proc.StandardError.ReadToEndAsync(token)
            try {
                await proc.WaitForExitAsync(token).ConfigureAwait(false)
            } catch (OperationCanceledException) {
                try {
                    if !proc.HasExited {
                        proc.Kill(entireProcessTree: true)
                    }
                } catch {
                    // best-effort

                }
                rethrow
            }
            var stdout string
            var stderr string
            try {
                stdout = await stdoutTask.ConfigureAwait(false)
            } catch (OperationCanceledException) {
                stdout = string.Empty
            }
            try {
                stderr = await stderrTask.ConfigureAwait(false)
            } catch (OperationCanceledException) {
                stderr = string.Empty
            }
            return (proc.ExitCode, stdout, stderr)
        }
    }

    shared {
        private const SchemaService string = "service"
        private const SchemaAccount string = "account"
        private const DefaultService string = "oahu-cli"
        private let DefaultTimeout TimeSpan = TimeSpan.FromSeconds(30)
    }
}
