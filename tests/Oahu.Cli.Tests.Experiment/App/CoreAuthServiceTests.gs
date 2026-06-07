// G# port of App/CoreAuthServiceTests.cs (PARTIAL).
//
// Contains CoreAuthRegionMappingTests (region enum mapping round-trips).
//
// LIMITATION: CallbackBridgeTests require (1) implementing IAuthCallbackBroker
// in G# (fails with GS0157: cannot find type for external interfaces) and
// (2) invoking delegate-typed struct fields from Oahu.Core.Callbacks (fails
// with GS0159: cannot find function for delegate field invocation). Both are
// G# 0.1.431 binder limitations. Skipped entirely.
//
// LIMITATION: Enum.GetValues[T]() returns corrupt values beyond the defined
// enum members in G# 0.1.431, causing All_Cli_Regions_Round_Trip to throw.
// Skipped; the Theory with all 11 InlineData rows already covers the same ground.

package Oahu.Cli.Tests.Experiment.App

import System
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Models
import Oahu.CommonTypes
import Xunit

type CoreAuthRegionMappingTests class {
    @Theory
    @InlineData(CliRegion.Us, ERegion.Us)
    @InlineData(CliRegion.Uk, ERegion.Uk)
    @InlineData(CliRegion.De, ERegion.De)
    @InlineData(CliRegion.Fr, ERegion.Fr)
    @InlineData(CliRegion.It, ERegion.It)
    @InlineData(CliRegion.Es, ERegion.Es)
    @InlineData(CliRegion.Jp, ERegion.Jp)
    @InlineData(CliRegion.Au, ERegion.Au)
    @InlineData(CliRegion.Ca, ERegion.Ca)
    @InlineData(CliRegion.In, ERegion.In)
    @InlineData(CliRegion.Br, ERegion.Br)
    func Region_Maps_Both_Directions(cli CliRegion, core ERegion) {
        Assert.Equal(core, CoreAuthService.ToCoreRegion(cli))
        Assert.Equal(cli, CoreAuthService.ToCliRegion(core))
    }
}
