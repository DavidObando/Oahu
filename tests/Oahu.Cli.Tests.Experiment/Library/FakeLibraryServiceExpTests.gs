// Sanity tests for src/Oahu.Cli.App.Experiment/Library/LibraryService.gs.
// Exercises the G# FakeLibraryService impl: filter chains, asin lookup, sync, refresh.

package Oahu.Cli.Tests.Experiment.Library

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Experiment.Library
import Oahu.Cli.App.Models
import Xunit

type FakeLibraryServiceExpTests class {

    func makeItems() IEnumerable[LibraryItem] {
        let list = List[LibraryItem]()
        list.Add(LibraryItem() {
            Asin = "B1", Title = "Foundation",
            Authors = []string{"Isaac Asimov"},
            Series = "Foundation",
            IsAvailable = true,
        })
        list.Add(LibraryItem() {
            Asin = "B2", Title = "Dune",
            Authors = []string{"Frank Herbert"},
            Series = "Dune Chronicles",
            IsAvailable = true,
        })
        list.Add(LibraryItem() {
            Asin = "B3", Title = "Deleted Title",
            Authors = []string{"Anonymous"},
            IsAvailable = false,
        })
        return list
    }

    @Fact
    func List_DefaultFilter_OnlyAvailable() {
        let svc = FakeLibraryService(makeItems())
        let result = svc.ListAsync(nil, CancellationToken.None).Result
        Assert.Equal(2, result.Count)
    }

    @Fact
    func List_AvailableOnlyFalse_IncludesAll() {
        let svc = FakeLibraryService(makeItems())
        let f = LibraryFilter() { AvailableOnly = false }
        let result = svc.ListAsync(f, CancellationToken.None).Result
        Assert.Equal(3, result.Count)
    }

    @Fact
    func List_SearchFilters_CaseInsensitive() {
        let svc = FakeLibraryService(makeItems())
        let f = LibraryFilter() { Search = "dune" }
        let result = svc.ListAsync(f, CancellationToken.None).Result
        Assert.Equal(1, result.Count)
        Assert.Equal("B2", result[0].Asin)
    }

    @Fact
    func List_AuthorFilters_CaseInsensitive() {
        let svc = FakeLibraryService(makeItems())
        let f = LibraryFilter() { Author = "ASIMOV" }
        let result = svc.ListAsync(f, CancellationToken.None).Result
        Assert.Equal(1, result.Count)
        Assert.Equal("B1", result[0].Asin)
    }

    @Fact
    func List_SeriesFilters_ExactCaseInsensitive() {
        let svc = FakeLibraryService(makeItems())
        let f = LibraryFilter() { Series = "FOUNDATION" }
        let result = svc.ListAsync(f, CancellationToken.None).Result
        Assert.Equal(1, result.Count)
        Assert.Equal("B1", result[0].Asin)
    }

    @Fact
    func Get_ReturnsMatching() {
        let svc = FakeLibraryService(makeItems())
        let r = svc.GetAsync("B2", CancellationToken.None).Result
        Assert.NotNull(r)
        Assert.Equal("Dune", r!!.Title)
    }

    @Fact
    func Get_ReturnsNil_WhenMissing() {
        let svc = FakeLibraryService(makeItems())
        let r = svc.GetAsync("ZZZ", CancellationToken.None).Result
        Assert.Null(r)
    }

    @Fact
    func Get_Throws_OnBlankAsin() {
        let svc = FakeLibraryService(makeItems())
        Assert.Throws[ArgumentException](func() {
            svc.GetAsync(" ", CancellationToken.None).Wait()
        })
    }

    @Fact
    func Sync_ReturnsCount() {
        let svc = FakeLibraryService(makeItems())
        let n = svc.SyncAsync("alias", CancellationToken.None).Result
        Assert.Equal(3, n)
    }

    @Fact
    func Sync_Throws_OnBlankAlias() {
        let svc = FakeLibraryService(makeItems())
        Assert.Throws[ArgumentException](func() {
            svc.SyncAsync("", CancellationToken.None).Wait()
        })
    }

    @Fact
    func Seed_AppendsItem() {
        let svc = FakeLibraryService(nil)
        svc.Seed(LibraryItem() {
            Asin = "X1", Title = "Seeded",
            IsAvailable = true,
        })
        let n = svc.SyncAsync("alias", CancellationToken.None).Result
        Assert.Equal(1, n)
    }

    @Fact
    func EnsureFresh_NoOp_Succeeds() {
        let svc = FakeLibraryService(nil)
        svc.EnsureFreshAsync(CancellationToken.None).Wait()
    }

    @Fact
    func Refresh_NoOp_Succeeds() {
        let svc = FakeLibraryService(nil)
        svc.RefreshAsync(CancellationToken.None).Wait()
    }
}
