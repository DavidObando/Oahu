// G# port of App/PerJobExportSettingsTests.cs.
//
// Covers the per-job decorator over IExportSettings: confirms the override
// values win for ExportDirectory, and that null overrides delegate the
// directory back to the wrapped inner instance. The ExportToAax property
// is written but not asserted on — see the NOTE below.
//
// NOTE (G# 0.1.431, gsharp#504 partial fix): write+read of a CLR `bool?`
// property now works in isolation, but **unwrapping** a `Nullable<T>` (via
// `.Value`, the `!!` non-null operator, or boxing through a `Nullable<T>`
// generic argument like `Assert.Equal[bool?]`) still emits invalid IL and
// throws `InvalidProgramException` at runtime. As soon as gsc grows correct
// nullable unwrap codegen, the `ExportToAax` asserts from the C# original
// can be restored.

package Oahu.Cli.Tests.Experiment.App

import Oahu.Cli.App.Jobs
import Oahu.Core
import Xunit

type PerJobExportSettingsTests class {
    @Fact
    func Override_Wins_Over_Inner() {
        var inner = ExportSettings()
        inner.ExportDirectory = "/tmp/inner"

        var sut = PerJobExportSettings(inner, true, "/tmp/job")

        Assert.Equal("/tmp/job", sut.ExportDirectory)

        // Inner was not mutated.
        Assert.Equal("/tmp/inner", inner.ExportDirectory)
    }

    @Fact
    func Null_Overrides_Delegate_To_Inner() {
        var inner = ExportSettings()
        inner.ExportDirectory = "/tmp/inner"

        var sut = PerJobExportSettings(inner)

        Assert.Equal("/tmp/inner", sut.ExportDirectory)
    }
}
