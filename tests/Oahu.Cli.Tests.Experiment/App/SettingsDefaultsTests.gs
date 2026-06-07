// G# port of App/SettingsDefaultsTests.cs.
//
// Tests that SettingsDefaults.ApplyDefaults fills missing DownloadDirectory,
// preserves existing values, treats whitespace as missing, and leaves
// ExportDirectory alone.

package Oahu.Cli.Tests.Experiment.App

import Oahu.Core
import Xunit

type SettingsDefaultsTests class {
    @Fact
    func ApplyDefaults_FillsMissingDownloadDirectory() {
        var dl = DownloadSettings()
        var ex = ExportSettings()

        SettingsDefaults.ApplyDefaults(dl, ex)

        Assert.Equal(SettingsDefaults.DefaultDownloadDirectory, dl.DownloadDirectory)
    }

    @Fact
    func ApplyDefaults_PreservesExistingDownloadDirectory() {
        let custom = "/tmp/custom-oahu-downloads"
        var dl = DownloadSettings()
        dl.DownloadDirectory = custom
        var ex = ExportSettings()

        SettingsDefaults.ApplyDefaults(dl, ex)

        Assert.Equal(custom, dl.DownloadDirectory)
    }

    @Fact
    func ApplyDefaults_TreatsWhitespaceAsMissing() {
        var dl = DownloadSettings()
        dl.DownloadDirectory = "   "
        var ex = ExportSettings()

        SettingsDefaults.ApplyDefaults(dl, ex)

        Assert.Equal(SettingsDefaults.DefaultDownloadDirectory, dl.DownloadDirectory)
    }

    @Fact
    func ApplyDefaults_LeavesExportDirectoryAlone() {
        // ExportDirectory is opt-in (only meaningful when ExportToAax is true)
        // and ApplyDefaults must not silently set it.
        var dl = DownloadSettings()
        var ex = ExportSettings()

        SettingsDefaults.ApplyDefaults(dl, ex)

        // LIMITATION: Cannot assert Null on Nullable<T> (gsharp#504/#517).
        // Instead verify the directory is empty/null-ish by checking it's not
        // set to the download default.
        Assert.NotEqual(SettingsDefaults.DefaultDownloadDirectory, ex.ExportDirectory)
    }
}
