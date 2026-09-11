package Oahu.Cli.E2E.Tests

import System
import System.Diagnostics
import System.IO
import System.Text
import System.Threading.Tasks

/// Subprocess-based runner for the built `oahu-cli` binary. Resolves the
/// CLI assembly via `dotnet` at the build output of the
/// `src/Oahu.Cli` project. Each spawn uses isolated `--config-dir`
/// and `--log-dir` flags so tests do not stomp on the developer's home.
internal class CliRunner {
    prop ConfigDir string {
        get;
        init;
    }

    prop LogDir string {
        get;
        init;
    }

    prop DataDir string {
        get;
        init;
    }

    init() {
        let root = Path.Combine(Path.GetTempPath(), "oahu-cli-e2e-" + Guid.NewGuid().ToString("N"))
        ConfigDir = Path.Combine(root, "config")
        LogDir = Path.Combine(root, "logs")
        DataDir = Path.Combine(root, "data")
        Directory.CreateDirectory(ConfigDir)
        Directory.CreateDirectory(LogDir)
        Directory.CreateDirectory(DataDir)
    }

    async func RunAsync(args ...string) CliResult -> await RunAsync(includeIsolation: true, args).ConfigureAwait(false)

    async func RunRawAsync(args ...string) CliResult -> await RunAsync(includeIsolation: false, args).ConfigureAwait(
        false
    )

    private async func RunAsync(includeIsolation bool, args[]string) CliResult {
        let psi = ProcessStartInfo("dotnet"){
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        }
        psi.ArgumentList.Add(CliDll)
        if includeIsolation {
            psi.ArgumentList.Add("--config-dir")
            psi.ArgumentList.Add(ConfigDir)
            psi.ArgumentList.Add("--log-dir")
            psi.ArgumentList.Add(LogDir)
        }
        for a in args {
            psi.ArgumentList.Add(a)
        }
        psi.Environment["OAHU_NO_TUI"] = "1"
        psi.Environment["NO_COLOR"] = "1"
        using let p = Process.Start(psi)!!
        let stdoutTask = p.StandardOutput.ReadToEndAsync()
        let stderrTask = p.StandardError.ReadToEndAsync()
        let exited = await Task.Run(() -> p.WaitForExit(60_000)).ConfigureAwait(false)
        if !exited {
            try {
                p.Kill(entireProcessTree: true)
            } catch { }
            throw TimeoutException("CLI process did not exit within 60 seconds.")
        }
        let stdout = await stdoutTask.ConfigureAwait(false)
        let stderr = await stderrTask.ConfigureAwait(false)
        return CliResult(p.ExitCode, stdout, stderr)
    }

    shared {
        private let CliDll string = ResolveCliDll()

        private func ResolveCliDll() string {
            let asmDir = Path.GetDirectoryName(typeof(CliRunner).Assembly.Location)!!
            let configFolder = DirectoryInfo(asmDir).Parent?.Name ?? "Debug"
            let tfm = DirectoryInfo(asmDir).Name
            let candidate = Path.GetFullPath(
                Path.Combine(
                    asmDir,
                    "..",
                    "..",
                    "..",
                    "..",
                    "..",
                    "src",
                    "Oahu.Cli",
                    "bin",
                    configFolder,
                    tfm,
                    "oahu-cli.dll"
                )
            )
            if !File.Exists(candidate) {
                throw FileNotFoundException(
                    "Could not locate built oahu-cli.dll. Build src/Oahu.Cli first. Tried: $candidate"
                )
            }
            return candidate
        }
    }
}

internal data class CliResult(ExitCode int32, StdOut string, StdErr string) {
    prop AllOutput string -> StringBuilder().Append(StdOut).Append(StdErr).ToString()
}
