package Oahu.Cli.Tests.App

import Oahu.Cli.App.Jobs
import Oahu.Core
import Xunit

class PerJobExportSettingsTests {
    @Fact
    func Override_Wins_Over_Inner() {
        let inner = ExportSettings{ExportToAax: false, ExportDirectory: "/tmp/inner"}
        let sut = PerJobExportSettings(inner, exportToAax: true, exportDirectory: "/tmp/job")
        Assert.Equal(true, sut.ExportToAax)
        Assert.Equal("/tmp/job", sut.ExportDirectory)
        // Inner was not mutated.
        Assert.Equal(false, inner.ExportToAax)
        Assert.Equal("/tmp/inner", inner.ExportDirectory)
    }

    @Fact
    func Null_Overrides_Delegate_To_Inner() {
        let inner = ExportSettings{ExportToAax: true, ExportDirectory: "/tmp/inner"}
        let sut = PerJobExportSettings(inner)
        Assert.Equal(true, sut.ExportToAax)
        Assert.Equal("/tmp/inner", sut.ExportDirectory)
    }
}
