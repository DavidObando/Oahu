// G# port of src/Oahu.Cli.App/Paths/CliPaths.cs.

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

    func resolveConfigDir() string {
        if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            let appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)
            return Path.Combine(appData, "oahu")
        }
        let xdg = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME")
        if !String.IsNullOrEmpty(xdg) {
            return Path.Combine(xdg!!, "oahu")
        }
        let home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
        return Path.Combine(home, ".config", "oahu")
    }

    func resolveLogDir() string {
        if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
            let local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
            return Path.Combine(local, "oahu", "logs")
        }
        let xdg = Environment.GetEnvironmentVariable("XDG_STATE_HOME")
        if !String.IsNullOrEmpty(xdg) {
            return Path.Combine(xdg!!, "oahu", "logs")
        }
        let home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
        return Path.Combine(home, ".local", "state", "oahu", "logs")
    }
}

