package Oahu.Cli.E2E.Tests

import System
import System.Diagnostics
import System.IO
import System.Text
import System.Threading.Tasks

data class CliResult(ExitCode int32, StdOut string, StdErr string) {
    prop AllOutput string {
        get {
            return StdOut + StdErr
        }
    }
}

// Resolves the built oahu-cli.dll relative to the test assembly's location.
// Walks up the standard `bin/<config>/<tfm>/` layout to the repo root.
func ResolveCliDll() string {
    let asmDir = Path.GetDirectoryName(typeof(CliResult).Assembly.Location)!!
    let parent = DirectoryInfo(asmDir).Parent!!
    let configFolder = parent.Name
    let tfm = DirectoryInfo(asmDir).Name
    let candidate = Path.GetFullPath(Path.Combine(asmDir, "..", "..", "..", "..", "..", "src", "Oahu.Cli", "bin", configFolder, tfm, "oahu-cli.dll"))
    if (!File.Exists(candidate)) {
        throw FileNotFoundException("Could not locate built oahu-cli.dll. Build src/Oahu.Cli first. Tried: $candidate")
    }
    return candidate
}

/// Subprocess-based runner for the built `oahu-cli` binary. Resolves the CLI
/// assembly via `dotnet` at the build output of the `src/Oahu.Cli` project. Each
/// spawn uses isolated `--config-dir` and `--log-dir` flags so tests do not stomp
/// on the developer's home.
class CliRunner {
    prop ConfigDir string
    prop LogDir string
    prop DataDir string

    init() {
        let root = Path.Combine(Path.GetTempPath(), "oahu-cli-e2e-exp-" + Guid.NewGuid().ToString("N"))
        ConfigDir = Path.Combine(root, "config")
        LogDir = Path.Combine(root, "logs")
        DataDir = Path.Combine(root, "data")
        Directory.CreateDirectory(ConfigDir)
        Directory.CreateDirectory(LogDir)
        Directory.CreateDirectory(DataDir)
    }

    async func RunAsync(args []string) CliResult {
        return await RunInternalAsync(true, args)
    }

    async func RunRawAsync(args []string) CliResult {
        return await RunInternalAsync(false, args)
    }

    async func RunInternalAsync(includeIsolation bool, args []string) CliResult {
        let psi = ProcessStartInfo("dotnet")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        }

        psi.ArgumentList.Add(ResolveCliDll())
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
                p.Kill(true)
            } catch (e Exception) {
                // best-effort
            }
            throw TimeoutException("CLI process did not exit within 60 seconds.")
        }

        let stdout = await stdoutTask.ConfigureAwait(false)
        let stderr = await stderrTask.ConfigureAwait(false)
        return CliResult(p.ExitCode, stdout, stderr)
    }
}
