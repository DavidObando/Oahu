// G# port of Commands/AuthLibraryCommandTests.cs.

package Oahu.Cli.Tests.Commands

import System
import System.Collections.Generic
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import Xunit

class AuthLibraryCommandTests {
    @Fact
    func AuthCommand_ToDictionary_HasStableKeys() {
        var session = AuthSession() {
            ProfileAlias = "us-1",
            Region = CliRegion.Us,
            AccountId = "A0001",
            AccountName = "Jane Doe",
            DeviceName = "Pixel",
            ExpiresAt = DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero),
        }
        var d = AuthCommand.ToDictionary(session)
        Assert.Equal[object]("us-1", d["profileAlias"])
        Assert.Equal[object]("us", d["region"])
        Assert.Equal[object]("A0001", d["accountId"])
        Assert.Equal[object]("Jane Doe", d["accountName"])
        Assert.Equal[object]("Pixel", d["deviceName"])
        Assert.False(bool(d["isExpired"]!!))
    }

    @Fact
    func LibraryCommand_ToDictionary_MapsRuntimeToMinutes() {
        var item = LibraryItem() {
            Asin = "B01",
            Title = "T",
            Authors = []string{"A"},
            Narrators = []string{"N"},
            Series = "S",
            SeriesPosition = 2.0,
            Runtime = TimeSpan.FromMinutes(123.4),
            IsAvailable = true,
        }
        var d = LibraryCommand.ToDictionary(item)
        Assert.Equal[object]("B01", d["asin"])
        Assert.Equal[object](123, d["runtimeMinutes"])
        Assert.Equal[object]("S", d["series"])
        Assert.Equal[object](2.0, d["seriesPosition"])
    }

    @Fact
    func LibraryCommand_ToDictionary_NullRuntimeStaysNull() {
        var item = LibraryItem() { Asin = "B02", Title = "T2" }
        Assert.Null(LibraryCommand.ToDictionary(item)["runtimeMinutes"])
        Assert.Null(LibraryCommand.ToDictionary(item)["series"])
    }

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
        Assert.Equal(s.ProfileAlias, active!!.ProfileAlias)
        svc.LogoutAsync(s.ProfileAlias).Wait()
        var listFinal = svc.ListSessionsAsync().Result
        Assert.Empty(listFinal)
        var activeFinal = svc.GetActiveAsync().Result
        Assert.Null(activeFinal)
    }

    @Fact
    func FakeLibraryService_FilterAndGetWork() {
        var seed = List[LibraryItem]()
        seed.Add(LibraryItem() {
            Asin = "A1",
            Title = "Project Hail Mary",
            Authors = []string{"Andy Weir"},
        })
        seed.Add(LibraryItem() {
            Asin = "A2",
            Title = "Dune",
            Authors = []string{"Frank Herbert"},
            IsAvailable = false,
        })
        let seq IEnumerable[LibraryItem] = seed
        var svc = FakeLibraryService(seq)

        var all = svc.ListAsync(LibraryFilter() { AvailableOnly = false }).Result
        Assert.Equal(2, all.Count)
        var avail = svc.ListAsync(LibraryFilter() { AvailableOnly = true }).Result
        Assert.Single(avail)
        var search = svc.ListAsync(LibraryFilter() { Search = "hail", AvailableOnly = false }).Result
        Assert.Single(search)
        Assert.Equal("A1", search[0].Asin)
        var got = svc.GetAsync("a2").Result
        Assert.NotNull(got)
        Assert.Equal("Dune", got!!.Title)
    }
}
