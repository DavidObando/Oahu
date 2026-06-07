// G# port of Commands/AuthLibraryCommandTests.cs (PARTIAL).
//
// Only the FakeAuthService round-trip test is ported. The remaining tests cannot
// compile because:
// - Tests 1-3 use AuthCommand.ToDictionary / LibraryCommand.ToDictionary from
//   Oahu.Cli.Commands, which is not referenced by this .gsproj.
// - Test 5 (FakeLibraryService_FilterAndGetWork) requires constructing
//   LibraryItem instances with required-init properties, which G# 0.1.431 does
//   not support (no object-initializer syntax; post-construction assignment to
//   init-only props emits MissingMethodException at runtime).
//
// Workarounds: gsharp#502 (async→sync via .Result/.Wait()), gsharp#504 (skip
// nullable unwrap assertion for active session).

package Oahu.Cli.Tests.Experiment.Commands

import System
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Models
import Xunit

type AuthLibraryCommandTests class {
    @Fact
    func FakeAuthService_RoundTripsLoginAndLogout() {
        var svc = FakeAuthService()
        var list = svc.ListSessionsAsync().Result
        Assert.Empty(list)
        var s = svc.LoginAsync(CliRegion.Uk, NonInteractiveCallbackBroker()).Result
        Assert.Equal(CliRegion.Uk, s.Region)
        var listAfter = svc.ListSessionsAsync().Result
        Assert.Single(listAfter)
        var active = svc.GetActiveAsync().Result
        Assert.NotNull(active)
        // LIMITATION gsharp#504: cannot unwrap Nullable<AuthSession> to compare
        // active.ProfileAlias == s.ProfileAlias
        svc.LogoutAsync(s.ProfileAlias).Wait()
        var listFinal = svc.ListSessionsAsync().Result
        Assert.Empty(listFinal)
        var activeFinal = svc.GetActiveAsync().Result
        Assert.Null(activeFinal)
    }
}
