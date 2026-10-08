package Oahu.App.Avalonia

import Avalonia
import Avalonia.Controls
import Avalonia.Controls.ApplicationLifetimes
import Avalonia.Layout
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

    func OnAboutClick(sender object?, e EventArgs) {
        let panel = StackPanel{Spacing: 8, Margin: Thickness(24), HorizontalAlignment: HorizontalAlignment.Center}
        panel.Children.Add(TextBlock{Text: "Oahu", FontSize: 24, FontWeight: Avalonia.Media.FontWeight.Bold, HorizontalAlignment: HorizontalAlignment.Center})
        panel.Children.Add(TextBlock{Text: "Version ${ApplEnv.AssemblyVersion}", HorizontalAlignment: HorizontalAlignment.Center})
        panel.Children.Add(TextBlock{Text: "Copyright © 2026 DavidObando", HorizontalAlignment: HorizontalAlignment.Center})
        let about = Window{
            Title: "About Oahu",
            Content: panel,
            Width: 320,
            SizeToContent: SizeToContent.Height,
            CanResize: false,
            WindowStartupLocation: WindowStartupLocation.CenterScreen
        }
        about.Show()
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
