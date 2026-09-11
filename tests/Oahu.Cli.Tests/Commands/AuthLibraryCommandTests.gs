package Oahu.Cli.Tests.Commands

import Oahu.Cli.App.Auth
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Xunit

class AuthLibraryCommandTests {
    @Fact
    func AuthCommand_ToDictionary_HasStableKeys() {
        let session = AuthSession{
            ProfileAlias: "us-1",
            Region: CliRegion.Us,
            AccountId: "A0001",
            AccountName: "Jane Doe",
            DeviceName: "Pixel",
            ExpiresAt: DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero)
        }
        let d = AuthCommand.ToDictionary(session)
        Assert.Equal("us-1", d["profileAlias"])
        Assert.Equal("us", d["region"])
        Assert.Equal("A0001", d["accountId"])
        Assert.Equal("Jane Doe", d["accountName"])
        Assert.Equal("Pixel", d["deviceName"])
        Assert.False(bool(d["isExpired"]!!))
    }

    @Fact
    func LibraryCommand_ToDictionary_MapsRuntimeToMinutes() {
        let item = LibraryItem{
            Asin: "B01",
            Title: "T",
            Authors: []string{"A"},
            Narrators: []string{"N"},
            Series: "S",
            SeriesPosition: 2.0,
            Runtime: TimeSpan.FromMinutes(123.4),
            IsAvailable: true
        }
        let d = LibraryCommand.ToDictionary(item)
        Assert.Equal("B01", d["asin"])
        Assert.Equal(123, d["runtimeMinutes"])
        Assert.Equal("S", d["series"])
        Assert.Equal(2.0, d["seriesPosition"])
    }

    @Fact
    func LibraryCommand_ToDictionary_NullRuntimeStaysNull() {
        let item = LibraryItem{Asin: "B02", Title: "T2"}
        Assert.Null(LibraryCommand.ToDictionary(item)["runtimeMinutes"])
        Assert.Null(LibraryCommand.ToDictionary(item)["series"])
    }

    @Fact
    async func FakeAuthService_RoundTripsLoginAndLogout() {
        let svc = FakeAuthService()
        Assert.Empty(await svc.ListSessionsAsync())
        let s = await svc.LoginAsync(CliRegion.Uk, NonInteractiveCallbackBroker())
        Assert.Equal(CliRegion.Uk, s.Region)
        Assert.Single(await svc.ListSessionsAsync())
        let active = await svc.GetActiveAsync()
        Assert.NotNull(active)
        Assert.Equal(s.ProfileAlias, active!!.ProfileAlias)
        await svc.LogoutAsync(s.ProfileAlias)
        Assert.Empty(await svc.ListSessionsAsync())
        Assert.Null(await svc.GetActiveAsync())
    }

    @Fact
    async func FakeLibraryService_FilterAndGetWork() {
        let svc = FakeLibraryService(
            []LibraryItem{
                LibraryItem{Asin: "A1", Title: "Project Hail Mary", Authors: []string{"Andy Weir"}},
                LibraryItem{Asin: "A2", Title: "Dune", Authors: []string{"Frank Herbert"}, IsAvailable: false}
            }
        )
        let all = await svc.ListAsync(LibraryFilter{AvailableOnly: false})
        Assert.Equal(2, all.Count)
        let avail = await svc.ListAsync(LibraryFilter{AvailableOnly: true})
        Assert.Single(avail)
        let search = await svc.ListAsync(LibraryFilter{Search: "hail", AvailableOnly: false})
        Assert.Single(search)
        Assert.Equal("A1", search[0].Asin)
        let got = await svc.GetAsync("a2")
        Assert.NotNull(got)
        Assert.Equal("Dune", got!!.Title)
    }
}
