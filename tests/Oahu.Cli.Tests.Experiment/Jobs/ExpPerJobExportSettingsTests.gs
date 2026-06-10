// Sanity tests for ExpPerJobExportSettings.

package Oahu.Cli.Tests.Experiment.Jobs

import Xunit
import System
import Oahu.Core
import Oahu.Cli.App.Experiment.Jobs

type ExpFakeInnerExportSettings class : IExportSettings {
    InnerToAax Nullable[bool] = nil
    InnerDir string = "/inner/dir"

    prop ExportToAax Nullable[bool] {
        get { return InnerToAax }
    }

    prop ExportDirectory string {
        get { return InnerDir }
    }
}

type ExpPerJobExportSettingsTests class {
    func makeInner() ExpFakeInnerExportSettings {
        return ExpFakeInnerExportSettings() { InnerToAax = true, InnerDir = "/x/y" }
    }

    @Fact
    func Defaults_Delegate_To_Inner() {
        let inner = makeInner()
        let s = ExpPerJobExportSettings() { Inner = inner }
        Assert.Equal[Nullable[bool]](true, s.ExportToAax)
        Assert.Equal("/x/y", s.ExportDirectory)
    }

    @Fact
    func Override_ExportToAax_Wins() {
        let inner = makeInner()
        let s = ExpPerJobExportSettings() { Inner = inner, ExportToAaxOverride = false }
        Assert.Equal[Nullable[bool]](false, s.ExportToAax)
    }

    @Fact
    func Override_ExportDirectory_Wins() {
        let inner = makeInner()
        let s = ExpPerJobExportSettings() { Inner = inner, ExportDirectoryOverride = "/over/ride" }
        Assert.Equal("/over/ride", s.ExportDirectory)
    }

    @Fact
    func Implements_IExportSettings() {
        let inner = makeInner()
        let s = ExpPerJobExportSettings() { Inner = inner }
        Assert.IsAssignableFrom[IExportSettings](s)
    }
}
