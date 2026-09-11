package Oahu.Cli.App.Credentials

import System
import System.Collections.Generic
import System.Diagnostics
import System.IO
import System.Linq
import System.Runtime.InteropServices
import System.Runtime.Versioning
import System.Threading
import System.Threading.Tasks

/// macOS Keychain-backed store driven by `/usr/bin/security`. We shell out to
/// avoid a P/Invoke dependency; the surface used (`security add-generic-password
/// / find-generic-password / delete-generic-password`) is stable and present on
/// every supported macOS version.
@SupportedOSPlatform("macos")
class MacOsKeychainCredentialStore : ICredentialStore {
    private let serviceName string
    private let securityBinary string

    init(serviceName string? = nil, securityBinary string? = nil) {
        this.serviceName = serviceName ?? DefaultService
        this.securityBinary = securityBinary ?? ResolveSecurityBinary()
    }

    prop Provider string -> "keychain"

    async func GetAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) string? {
        ArgumentException.ThrowIfNullOrWhiteSpace(account)
        let (code, stdout, _) = await RunAsync(
            []string{"find-generic-password", "-s", serviceName, "-a", account, "-w"},
            cancellationToken
        ).ConfigureAwait(false)
        if code == 44 {
            return nil
        }
        if code != 0 {
            throw CredentialStoreOperationException("find-generic-password", code)
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
        // NOTE: `security add-generic-password -w <secret>` exposes the secret via argv (visible to
        // `ps` and crash dumps for any process owned by the current user). The macOS `security` tool
        // does not offer a stdin-fed equivalent for generic-password creation, so we accept this
        // tradeoff for the v1 shell-out approach. A future change can move to the native Keychain
        // Services API via P/Invoke to keep the secret entirely in this process's address space.
        let (code, _, _) = await RunAsync(
            []string{"add-generic-password", "-U", "-s", serviceName, "-a", account, "-w", secret},
            cancellationToken
        ).ConfigureAwait(false)
        if code != 0 {
            throw CredentialStoreOperationException("add-generic-password", code)
        }
    }

    async func DeleteAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) bool {
        ArgumentException.ThrowIfNullOrWhiteSpace(account)
        let (code, _, _) = await RunAsync(
            []string{"delete-generic-password", "-s", serviceName, "-a", account},
            cancellationToken
        ).ConfigureAwait(false)
        if code == 44 {
            return false
        }
        if code != 0 {
            throw CredentialStoreOperationException("delete-generic-password", code)
        }
        return true
    }

    func ListAccountsAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[
        IReadOnlyList[string]
    ] {
        // /usr/bin/security has no clean "list accounts under a service" verb; defer to Phase 4.
        // Returning an empty list is fine for now since all callers only use Get/Set/Delete keyed by alias.
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult[IReadOnlyList[string]](Array.Empty[string]())
    }

    private async func RunAsync(args[]string, ct CancellationToken)(Code int32, StdOut string, StdErr string) {
        let psi = ProcessStartInfo(securityBinary){
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        }
        for a in args {
            psi.ArgumentList.Add(a)
        }
        // Bound the wait so a hung Keychain agent (e.g., headless / locked / GUI prompt
        // that nobody answers) cannot deadlock the CLI forever. The user-visible token
        // is "operation timed out", surfaced through the existing exception path.
        using let timeoutCts = CancellationTokenSource(DefaultTimeout)
        using let linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token)
        let token = linkedCts.Token
        using let proc = Process.Start(psi) ?? throw CredentialStoreUnavailableException(
            "Could not start $securityBinary."
        )
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
        // Drain stdio after the process is gone; otherwise disposing the proc tears the
        // pipes down beneath the still-running ReadToEndAsync tasks, throwing
        // ObjectDisposedException from inside their continuations.
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

    shared {
        private const DefaultService string = "oahu-cli"
        private let DefaultTimeout TimeSpan = TimeSpan.FromSeconds(30)

        private func ResolveSecurityBinary() string {
            // Default location on every supported macOS release; fall back to PATH so users
            // with a non-standard install (e.g. command-line-tools-only) still resolve it.
            if File.Exists("/usr/bin/security") {
                return "/usr/bin/security"
            }
            let pathEnv = Environment.GetEnvironmentVariable("PATH")
            if !string.IsNullOrEmpty(pathEnv) {
                for dir in pathEnv.Split(Path.PathSeparator) {
                    if string.IsNullOrEmpty(dir) {
                        continue
                    }
                    let candidate = Path.Combine(dir, "security")
                    if File.Exists(candidate) {
                        return candidate
                    }
                }
            }
            return "/usr/bin/security"
        }
    }
}

class CredentialStoreOperationException : Exception {
    init(operation string, exitCode int32) : base(
        "Credential store operation '$operation' failed with exit code $exitCode."
    ) {
        Operation = operation
        ExitCode = exitCode
    }

    prop Operation string {
        get;
        init;
    }

    prop ExitCode int32 {
        get;
        init;
    }
}
