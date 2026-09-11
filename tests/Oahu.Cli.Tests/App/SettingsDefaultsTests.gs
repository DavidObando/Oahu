package Oahu.Cli.Tests.App

import Oahu.Core
import Xunit

class SettingsDefaultsTests {
    @Fact
    func ApplyDefaults_FillsMissingDownloadDirectory() {
        let dl = DownloadSettings()
        let ex = ExportSettings()
        SettingsDefaults.ApplyDefaults(dl, ex)
        Assert.Equal(SettingsDefaults.DefaultDownloadDirectory, dl.DownloadDirectory)
    }

    @Fact
    func ApplyDefaults_PreservesExistingDownloadDirectory() {
        const Custom = "/tmp/custom-oahu-downloads"
        let dl = DownloadSettings{DownloadDirectory: Custom}
        let ex = ExportSettings()
        SettingsDefaults.ApplyDefaults(dl, ex)
        Assert.Equal(Custom, dl.DownloadDirectory)
    }

    @Fact
    func ApplyDefaults_TreatsWhitespaceAsMissing() {
        let dl = DownloadSettings{DownloadDirectory: "   "}
        let ex = ExportSettings()
        SettingsDefaults.ApplyDefaults(dl, ex)
        Assert.Equal(SettingsDefaults.DefaultDownloadDirectory, dl.DownloadDirectory)
    }

    @Fact
    func ApplyDefaults_LeavesExportDirectoryAlone() {
        // ExportDirectory is opt-in (only meaningful when ExportToAax is true)
        // and ApplyDefaults must not silently set it. Otherwise a user who has
        // never enabled AAX export would suddenly find a path written into
        // their settings.
        let dl = DownloadSettings()
        let ex = ExportSettings()
        SettingsDefaults.ApplyDefaults(dl, ex)
        Assert.Null(ex.ExportDirectory)
    }
}
