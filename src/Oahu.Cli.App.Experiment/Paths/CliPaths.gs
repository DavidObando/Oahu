// G# port of src/Oahu.Cli.App/Paths/CliPaths.cs.
// Workarounds applied (against G# 0.1.516):
//   * gsharp#672 — Environment.SpecialFolder (nested CLR enum) is not visible to
//     the binder. We read raw env vars (HOME / USERPROFILE / APPDATA /
//     LOCALAPPDATA) instead.
//   * Multiple `?:` expressions in this file triggered a runtime
//     TypeLoadException for the synthetic <Program> type (see gsharp#673 below
//     in this branch's filed-issues note). Rewritten with if/else.

package Oahu.Cli.App.Experiment.Paths

import System
import System.IO
import System.Runtime.InteropServices
import Oahu.Aux
import Oahu.Core

type ExpCliPaths class {
    ConfigDir string = ""
    LogDir string = ""

    func ensure() {
        if ConfigDir == "" {
            ConfigDir = resolveConfigDir()
        }
        if LogDir == "" {
            LogDir = resolveLogDir()
        }
    }

    func DefaultDownloadDir() string {
        return SettingsDefaults.DefaultDownloadDirectory
    }

    func SharedUserDataDir() string {
        return ApplEnv.LocalApplDirectory
    }

    func ConfigFile() string {
        return Path.Combine(ConfigDir, "config.json")
    }

    func TodayLogFile() string {
        return Path.Combine(LogDir, "oahu-cli-" + DateTime.Now.ToString("yyyyMMdd") + ".log")
    }

    func EnsureDirectories() {
        Directory.CreateDirectory(ConfigDir)
        Directory.CreateDirectory(LogDir)
    }

    func userHome() string {
        let h = Environment.GetEnvironmentVariable("HOME")
        if !String.IsNullOrEmpty(h) {
            return h!!
        }
        let u = Environment.GetEnvironmentVariable("USERPROFILE")
        if String.IsNullOrEmpty(u) {
            return ""
        }
        return u!!
    }

    func resolveConfigDir() string {
        if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            let appData = Environment.GetEnvironmentVariable("APPDATA")
            var head string = ""
            if !String.IsNullOrEmpty(appData) {
                head = appData!!
            }
            return Path.Combine(head, "oahu")
        }
        let xdg = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME")
        if !String.IsNullOrEmpty(xdg) {
            return Path.Combine(xdg!!, "oahu")
        }
        return Path.Combine(userHome(), ".config", "oahu")
    }

    func resolveLogDir() string {
        if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            let local = Environment.GetEnvironmentVariable("LOCALAPPDATA")
            var head string = ""
            if !String.IsNullOrEmpty(local) {
                head = local!!
            }
            return Path.Combine(head, "oahu", "logs")
        }
        let xdg = Environment.GetEnvironmentVariable("XDG_STATE_HOME")
        if !String.IsNullOrEmpty(xdg) {
            return Path.Combine(xdg!!, "oahu", "logs")
        }
        let home = userHome()
        return Path.Combine(home, ".local", "state", "oahu", "logs")
    }
}

