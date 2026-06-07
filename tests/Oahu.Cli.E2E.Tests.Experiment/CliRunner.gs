// G# port of E2E CliRunner helper.
//
// Subprocess-based runner for the built oahu-cli binary. Resolves the CLI
// assembly via `dotnet` at the build output of the src/Oahu.Cli project. Each
// spawn uses isolated --config-dir and --log-dir flags so tests do not stomp
// on the developer's home.
//
// NOTE (G# 0.1.431, gsharp#502 partial fix): `async func` declared as a class
// member now parses, but the synthesized return type doesn't appear to lift
// to `Task<T>` (calls to such a method return the bare `T` and `await` is
// rejected with GS0133; the void-returning shape compiles but the awaited
// state machine never resumes and tests hang). So this helper stays
// synchronous (blocking `ReadToEnd` + `WaitForExit(timeout)`) until that
// path is solid.

package Oahu.Cli.E2E.Tests.Experiment

import System
import System.Diagnostics
import System.IO

type CliResult class(ExitCode int32, StdOut string, StdErr string) {
    func AllOutput() string {
        return StdOut + StdErr
    }
}

// Resolves the built oahu-cli.dll relative to the test assembly's location.
// Walks up the standard `bin/<config>/<tfm>/` layout to the repo root.
func resolveCliDll() string {
    let asmDir = Path.GetDirectoryName(typeof(CliResult).Assembly.Location)!!
    let parent = DirectoryInfo(asmDir).Parent!!
    let configFolder = parent.Name
    let tfm = DirectoryInfo(asmDir).Name
    return Path.GetFullPath(Path.Combine(asmDir, "..", "..", "..", "..", "..", "src", "Oahu.Cli", "bin", configFolder, tfm, "oahu-cli.dll"))
}

type CliRunner class {
    ConfigDir string
    LogDir string
    DataDir string

    init() {
        let root = Path.Combine(Path.GetTempPath(), "oahu-cli-e2e-exp-" + Guid.NewGuid().ToString("N"))
        ConfigDir = Path.Combine(root, "config")
        LogDir = Path.Combine(root, "logs")
        DataDir = Path.Combine(root, "data")
        Directory.CreateDirectory(ConfigDir)
        Directory.CreateDirectory(LogDir)
        Directory.CreateDirectory(DataDir)
    }

    func Run(args []string) CliResult {
        return runInternal(true, args)
    }

    func RunRaw(args []string) CliResult {
        return runInternal(false, args)
    }

    func runInternal(includeIsolation bool, args []string) CliResult {
        var psi = ProcessStartInfo("dotnet")
        psi.RedirectStandardOutput = true
        psi.RedirectStandardError = true
        psi.UseShellExecute = false
        psi.CreateNoWindow = true

        psi.ArgumentList.Add(resolveCliDll())
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

        let p = Process.Start(psi)!!
        defer p.Dispose()

        let stdout = p.StandardOutput.ReadToEnd()
        let stderr = p.StandardError.ReadToEnd()
        let exited = p.WaitForExit(60_000)
        if !exited {
            try {
                p.Kill(true)
            } catch (e Exception) {
                // best-effort
            }
            throw TimeoutException("CLI process did not exit within 60 seconds.")
        }
        return CliResult(p.ExitCode, stdout, stderr)
    }
}
