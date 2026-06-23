// G# port of App/FakeServicesTests.cs.
//
// Recovery (0.1.516): FakeLibraryServiceTests now work — init-only property
// MissingMethodException + slice↔array fixed. Full suite ported.

package Oahu.Cli.Tests.App

import System
import System.Collections.Generic
import System.Threading
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Xunit

class FakeLibraryServiceTests {
    func Seed() FakeLibraryService {
        return FakeLibraryService(
            [3]LibraryItem {
                LibraryItem() {
                    Asin = "A1",
                    Title = "Project Hail Mary",
                    Authors = []string{"Andy Weir"},
                    Series = "Standalone",
                    IsAvailable = true
                },
                LibraryItem() {
                    Asin = "A2",
                    Title = "The Way of Kings",
                    Authors = []string{"Brandon Sanderson"},
                    Series = "Stormlight",
                    IsAvailable = true
                },
                LibraryItem() {
                    Asin = "A3",
                    Title = "Words of Radiance",
                    Authors = []string{"Brandon Sanderson"},
                    Series = "Stormlight",
                    IsAvailable = false
                }
            })
    }

    @Fact
    async func List_All_Returns_Available_By_Default() {
        let svc = Seed()
        let items = await svc.ListAsync()
        Assert.Equal(2, items.Count)
        for i in items {
            Assert.NotEqual("A3", i.Asin)
        }
    }

    @Fact
    async func List_With_Search_Filters_Title_Case_Insensitive() {
        let svc = Seed()
        let items = await svc.ListAsync(LibraryFilter() { Search = "kings" })
        Assert.Single(items)
        Assert.Equal("A2", items[0].Asin)
    }

    @Fact
    async func List_With_Author_Filter() {
        let svc = Seed()
        let items = await svc.ListAsync(LibraryFilter() { Author = "sanderson" })
        Assert.Single(items)
    }

    @Fact
    async func List_With_AvailableOnly_False_Includes_Unavailable() {
        let svc = Seed()
        let items = await svc.ListAsync(LibraryFilter() { AvailableOnly = false })
        Assert.Equal(3, items.Count)
    }

    @Fact
    async func Get_By_Asin_Case_Insensitive() {
        let svc = Seed()
        let item = await svc.GetAsync("a1")
        Assert.NotNull(item)
        Assert.Equal("Project Hail Mary", item.Title)
    }
}

class FakeAuthServiceTests {
    @Fact
    async func Login_Then_GetActive_Returns_Session() {
        let svc = FakeAuthService()
        let s = await svc.LoginAsync(CliRegion.Us, NonInteractiveCallbackBroker())
        Assert.Equal(CliRegion.Us, s.Region)

        let active = await svc.GetActiveAsync()
        Assert.NotNull(active)
        Assert.Equal(s.ProfileAlias, active.ProfileAlias)
    }

    @Fact
    async func Logout_Removes_Session() {
        let svc = FakeAuthService()
        let s = await svc.LoginAsync(CliRegion.De, NonInteractiveCallbackBroker())
        await svc.LogoutAsync(s.ProfileAlias)
        Assert.Empty( await svc.ListSessionsAsync())
        Assert.Null(await svc.GetActiveAsync())
    }

    @Fact
    async func Refresh_Updates_ExpiresAt() {
        let svc = FakeAuthService()
        let s = await svc.LoginAsync(CliRegion.Uk, NonInteractiveCallbackBroker())
        await Task.Delay(10)
        let refreshed = await svc.RefreshAsync(s.ProfileAlias)
        Assert.NotNull(refreshed)
        Assert.True(refreshed.ExpiresAt!! > s.ExpiresAt!!)
    }
}
