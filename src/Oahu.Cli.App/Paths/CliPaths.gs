package Oahu.Cli.App.Paths

import Oahu.Aux
import Oahu.Core
import System
import System.IO
import System.Runtime.InteropServices

/// Centralised path layout for oahu-cli.
///
/// Per the design doc (§7), CLI-only state (config + logs) lives under XDG-style
/// per-binary directories. Library cache, profile, queue, and history live alongside
/// the GUI's user-data directory and are owned by `Oahu.Core` / `Oahu.Data`
/// (via `Oahu.Aux.ApplEnv.LocalApplDirectory`) — not here.
class CliPaths {
    shared {
        const AppName string = "oahu"

        /// Directory where the user's `config.json` for the CLI lives.
        /// Linux/macOS: `$XDG_CONFIG_HOME/oahu` or `~/.config/oahu`.
        /// Windows: `%APPDATA%\oahu`.
        private let _configDir string = ResolveConfigDir()

        prop ConfigDir string {
            get {
                return _configDir
            }
        }

        /// Directory where rotated daily log files are written.
        /// Linux/macOS: `$XDG_STATE_HOME/oahu/logs` or `~/.local/state/oahu/logs`.
        /// Windows: `%LOCALAPPDATA%\oahu\logs`.
        private let _logDir string = ResolveLogDir()

        prop LogDir string {
            get {
                return _logDir
            }
        }

        /// Default download directory used by the GUI; the CLI honours the same default.
        /// `~/Music/Oahu/Downloads` on all platforms.
        /// @remarks Delegates to (cref:Oahu.Core.SettingsDefaults.DefaultDownloadDirectory)
        /// so there is exactly one source of truth shared with the Avalonia GUI.
        prop DefaultDownloadDir string -> SettingsDefaults.DefaultDownloadDirectory

        /// User-data directory shared with the Avalonia GUI. Mirrors
        /// `Oahu.Aux.ApplEnv.LocalApplDirectory` exactly so both binaries read/write the
        /// same location (case-sensitive on Linux/macOS — the GUI's entry assembly name
        /// "Oahu" determines the directory casing).
        private let _sharedUserDataDir string = ApplEnv.LocalApplDirectory

        prop SharedUserDataDir string {
            get {
                return _sharedUserDataDir
            }
        }

        prop ConfigFile string -> Path.Combine(ConfigDir, "config.json")
        func TodayLogFile() string -> Path.Combine(LogDir, "oahu-cli-${DateTime.Now:yyyyMMdd}.log")

        /// Ensures every CLI-managed directory exists. Idempotent.
        func EnsureDirectories() {
            Directory.CreateDirectory(ConfigDir)
            Directory.CreateDirectory(LogDir)
        }

        private func ResolveConfigDir() string {
            if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                let appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)
                return Path.Combine(appData, AppName)
            }
            let xdg = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME")
            if !string.IsNullOrEmpty(xdg) {
                return Path.Combine(xdg, AppName)
            }
            let home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
            return Path.Combine(home, ".config", AppName)
        }

        private func ResolveLogDir() string {
            if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                let local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
                return Path.Combine(local, AppName, "logs")
            }
            let xdg = Environment.GetEnvironmentVariable("XDG_STATE_HOME")
            if !string.IsNullOrEmpty(xdg) {
                return Path.Combine(xdg, AppName, "logs")
            }
            let home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
            return Path.Combine(home, ".local", "state", AppName, "logs")
        }
    }
}
