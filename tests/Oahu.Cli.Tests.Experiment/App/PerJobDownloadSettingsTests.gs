// G# port of App/PerJobDownloadSettingsTests.cs.
//
// Covers the per-job decorator over IDownloadSettings: confirms the quality
// override wins, that other members delegate to the wrapped inner instance,
// and that ChangedSettings event subscription forwards to the inner settings.
//
// NOTE (G# 0.1.431, gsharp#503 partial): the C# original wires the event
// handler as a closure-capturing lambda. gsc still silently fails (MSB4181)
// on that shape — but method-group conversion (`event += this.method`) now
// compiles and runs correctly, so we use that form here instead.

package Oahu.Cli.Tests.Experiment.App

import System
import Oahu.BooksDatabase
import Oahu.Cli.App.Jobs
import Oahu.Core
import Xunit

type PerJobDownloadSettingsTests class {
    hits int32

    func onChanged(sender object, e EventArgs) {
        hits = hits + 1
    }

    @Fact
    func Override_Wins_Over_Inner_Quality() {
        var inner = DownloadSettings()
        inner.DownloadQuality = EDownloadQuality.Normal
        inner.DownloadDirectory = "/tmp"
        inner.MultiPartDownload = true
        inner.KeepEncryptedFiles = true

        var sut = PerJobDownloadSettings(inner, EDownloadQuality.Extreme)

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
        var inner = DownloadSettings()
        var sut = PerJobDownloadSettings(inner, EDownloadQuality.High)

        hits = 0
        sut.ChangedSettings += onChanged
        inner.OnChange()
        Assert.Equal(1, hits)

        sut.ChangedSettings -= onChanged
        inner.OnChange()
        Assert.Equal(1, hits)
    }
}
