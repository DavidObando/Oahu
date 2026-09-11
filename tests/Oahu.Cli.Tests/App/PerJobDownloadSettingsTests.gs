package Oahu.Cli.Tests.App

import Oahu.BooksDatabase
import Oahu.Cli.App.Jobs
import Oahu.Core
import System
import Xunit

class PerJobDownloadSettingsTests {
    @Fact
    func Override_Wins_Over_Inner_Quality() {
        let inner = DownloadSettings{
            DownloadQuality: EDownloadQuality.Normal,
            DownloadDirectory: "/tmp",
            MultiPartDownload: true,
            KeepEncryptedFiles: true
        }
        let sut = PerJobDownloadSettings(inner, EDownloadQuality.Extreme)
        Assert.Equal(EDownloadQuality.Extreme, sut.DownloadQuality)
        // Other members delegate.
        Assert.Equal("/tmp", sut.DownloadDirectory)
        Assert.True(sut.MultiPartDownload)
        Assert.True(sut.KeepEncryptedFiles)
        // Inner was not mutated.
        Assert.Equal(EDownloadQuality.Normal, inner.DownloadQuality)
    }

    @Fact
    func ChangedSettings_Subscription_Forwards_To_Inner() {
        let inner = DownloadSettings{DownloadQuality: EDownloadQuality.High}
        let sut = PerJobDownloadSettings(inner, EDownloadQuality.High)
        var hits = 0
        let handler EventHandler = (_ object?, _ EventArgs) -> hits++
        sut.ChangedSettings += handler
        inner.OnChange()
        Assert.Equal(1, hits)
        sut.ChangedSettings -= handler
        inner.OnChange()
        Assert.Equal(1, hits)
    }
}
