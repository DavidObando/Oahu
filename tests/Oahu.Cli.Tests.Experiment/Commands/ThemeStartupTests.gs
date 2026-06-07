// G# port of Commands/ThemeStartupTests.cs (FAILED — no tests portable).
//
// All tests require constructing GlobalOptions with init-only properties
// (ThemeOverride, ForceNoColor). G# 0.1.431 cannot set init-only properties:
// object-initializer syntax T() { Prop = v } doesn't parse, and
// post-construction assignment compiles but throws MissingMethodException
// at runtime.
//
// TuiCommand.ResolveStartupThemeName itself is testable (static, takes
// GlobalOptions + string?), but we cannot construct GlobalOptions with the
// needed property values to exercise the method.

package Oahu.Cli.Tests.Experiment.Commands

import Xunit

type ThemeStartupTests class {
    @Fact
    func Placeholder_DocumentsBlockingLimitations() {
        // All real tests blocked by init-only property limitation on GlobalOptions.
        // GlobalOptions.ThemeOverride and GlobalOptions.ForceNoColor are { get; init; }
        Assert.True(true)
    }
}
