// G# port of App/CoreEnvironmentTests.cs.
//
// Covers CoreEnvironment.Initialize idempotency and ApplEnv path-override
// behaviour. Purely synchronous — no gsharp#502 workaround needed.

package Oahu.Cli.Tests.App

import System
import System.IO
import Oahu.Aux
import Oahu.Cli.App.Core
import Xunit

class CoreEnvironmentTests {
    @Fact
    func Initialize_With_Same_Name_Is_Idempotent() {
        var name = ApplEnv.ApplName
        CoreEnvironment.Initialize(name)
        CoreEnvironment.Initialize(name)
        Assert.Equal(name, ApplEnv.ApplName)
    }

    @Fact
    func Initialize_With_Different_Name_Throws_When_Already_Initialized() {
        CoreEnvironment.Initialize(ApplEnv.ApplName)
        var ex = Assert.Throws[InvalidOperationException](func() {
            CoreEnvironment.Initialize("definitely-not-the-current-applname")
        })
        Assert.Contains("already initialized", ex.Message, StringComparison.OrdinalIgnoreCase)
    }

    @Fact
    func OverrideApplName_Reroutes_Local_Application_Directory() {
        var prior = ApplEnv.ApplName
        try {
            ApplEnv.OverrideApplName("oahu-cli-test-marker")
            Assert.Equal("oahu-cli-test-marker", ApplEnv.ApplName)
            Assert.EndsWith(
                Path.Combine("oahu-cli-test-marker", "settings"),
                ApplEnv.SettingsDirectory,
                StringComparison.Ordinal)
            Assert.EndsWith("oahu-cli-test-marker", ApplEnv.LocalApplDirectory, StringComparison.Ordinal)
        } finally {
            ApplEnv.OverrideApplName(prior)
        }
    }
}
