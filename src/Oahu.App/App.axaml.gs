package Oahu.App.Avalonia

import Avalonia
import Avalonia.Controls.ApplicationLifetimes
import Avalonia.Markup.Xaml
import Oahu.Aux
import Oahu.Aux.Logging
import Oahu.CommonTypes
import Oahu.Core
import Oahu.Core.UI.Avalonia.ViewModels
import Oahu.SystemManagement
import System
import System.Globalization

partial class App : Application {
    override func Initialize() {
        AvaloniaXamlLoader.Load(this)
    }

    override func OnFrameworkInitializationCompleted() {
        if ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop {
            CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture
            Log(1, this, () -> "${ApplEnv.ApplName} ${ApplEnv.AssemblyVersion}")
            Logging.Level = 3
            Logging.InstantFlush = true
            let userSettings = SettingsManager.GetUserSettings[UserSettings]()
            let hardwareIdProvider = GetHardwareIdProvider()
            let audibleClient = AudibleClient(
                userSettings.ConfigSettings,
                userSettings.DownloadSettings,
                hardwareIdProvider
            )
            let viewModel = MainWindowViewModel()
            viewModel.AudibleClient = audibleClient
            viewModel.InitSettings(
                userSettings.DownloadSettings,
                userSettings.ExportSettings,
                userSettings.ConfigSettings
            )
            viewModel.Title = ApplEnv.AssemblyTitle ?? "Oahu"
            let mainWindow = MainWindow(viewModel, userSettings)
            desktop.MainWindow = mainWindow
        }
        base.OnFrameworkInitializationCompleted()
    }

    shared {
        private func GetHardwareIdProvider() IHardwareIdProvider {
            if OperatingSystem.IsWindows() {
                return WinHardwareIdProvider()
            }
            if OperatingSystem.IsMacOS() {
                return MacHardwareIdProvider()
            }
            if OperatingSystem.IsLinux() {
                return LinuxHardwareIdProvider()
            }
            throw PlatformNotSupportedException()
        }
    }
}
