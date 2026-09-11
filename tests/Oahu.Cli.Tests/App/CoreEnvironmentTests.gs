package Oahu.Cli.Tests.App

import Oahu.Aux
import Oahu.Cli.App.Core
import System
import System.IO
import System.Threading.Tasks
import Xunit

/// Tests for (cref:CoreEnvironment)'s path-override behaviour. These run
/// before any other test that touches (cref:ApplEnv) paths sticks the
/// process to a real-name root, so they live in their own file and use a
/// deliberately-unique application name.
class CoreEnvironmentTests {
    @Fact
    func Initialize_With_Same_Name_Is_Idempotent() {
        // The first test to call Initialize wins for the lifetime of the
        // process (xunit runs each assembly in one AppDomain). Use the same
        // name across repeated calls and assert no throw.
        let name = ApplEnv.ApplName
        // Either the default name (assembly) or one set by an earlier test —
        // both cases are exercised by re-applying the current name.
        CoreEnvironment.Initialize(name!!)
        CoreEnvironment.Initialize(name!!)
        Assert.Equal(name, ApplEnv.ApplName)
    }

    @Fact
    func Initialize_With_Different_Name_Throws_When_Already_Initialized() {
        // Force a known initial state by initializing with the current name.
        CoreEnvironment.Initialize(ApplEnv.ApplName!!)
        let ex = Assert.Throws[InvalidOperationException](
            () -> CoreEnvironment.Initialize("definitely-not-the-current-applname")
        )
        Assert.Contains("already initialized", ex.Message, StringComparison.OrdinalIgnoreCase)
    }

    @Fact
    func OverrideApplName_Reroutes_Local_Application_Directory() {
        // Spot-check ApplEnv directly: changing ApplName must update derived paths.
        let prior = ApplEnv.ApplName
        try {
            ApplEnv.OverrideApplName("oahu-cli-test-marker")
            Assert.Equal("oahu-cli-test-marker", ApplEnv.ApplName)
            Assert.EndsWith(
                Path.Combine("oahu-cli-test-marker", "settings"),
                ApplEnv.SettingsDirectory,
                StringComparison.Ordinal
            )
            Assert.EndsWith("oahu-cli-test-marker", ApplEnv.LocalApplDirectory, StringComparison.Ordinal)
        } finally {
            // Restore so other tests in the same assembly aren't affected.
            ApplEnv.OverrideApplName(prior!!)
        }
    }
}
