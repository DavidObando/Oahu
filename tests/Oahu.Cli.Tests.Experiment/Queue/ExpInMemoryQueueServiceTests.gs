// Sanity tests for ExpInMemoryQueueService.

package Oahu.Cli.Tests.Experiment.Queue

import Xunit
import System
import System.Threading
import System.Linq
import Oahu.Cli.App.Models
import Oahu.Cli.App.Experiment.Queue

type ExpInMemoryQueueServiceTests class {
    func makeEntry(asin string) QueueEntry {
        return QueueEntry() { Asin = asin, Title = "T " + asin, Quality = DownloadQuality.High }
    }

    @Fact
    func Empty_List_When_New() {
        var q = ExpInMemoryQueueService()
        var lst = q.ListAsync(CancellationToken.None).Result
        Assert.Equal[int32](0, lst.Count)
    }

    @Fact
    func Add_Persists_Entry() {
        var q = ExpInMemoryQueueService()
        Assert.True(q.AddAsync(makeEntry("A1"), CancellationToken.None).Result)
        var lst = q.ListAsync(CancellationToken.None).Result
        Assert.Equal[int32](1, lst.Count)
    }

    @Fact
    func Add_Duplicate_Returns_False() {
        var q = ExpInMemoryQueueService()
        q.AddAsync(makeEntry("A1"), CancellationToken.None).Wait()
        Assert.False(q.AddAsync(makeEntry("A1"), CancellationToken.None).Result)
    }

    @Fact
    func Remove_Existing_Returns_True() {
        var q = ExpInMemoryQueueService()
        q.AddAsync(makeEntry("A1"), CancellationToken.None).Wait()
        Assert.True(q.RemoveAsync("a1", CancellationToken.None).Result)
        Assert.Equal[int32](0, q.ListAsync(CancellationToken.None).Result.Count)
    }

    @Fact
    func Remove_Missing_Returns_False() {
        var q = ExpInMemoryQueueService()
        Assert.False(q.RemoveAsync("nope", CancellationToken.None).Result)
    }

    @Fact
    func Move_Down_Swaps_Entries() {
        var q = ExpInMemoryQueueService()
        q.AddAsync(makeEntry("A"), CancellationToken.None).Wait()
        q.AddAsync(makeEntry("B"), CancellationToken.None).Wait()
        Assert.True(q.MoveAsync("A", 1, CancellationToken.None).Result)
        var lst = q.ListAsync(CancellationToken.None).Result
        Assert.Equal("B", lst[0].Asin)
        Assert.Equal("A", lst[1].Asin)
    }

    @Fact
    func Move_Off_End_Returns_False() {
        var q = ExpInMemoryQueueService()
        q.AddAsync(makeEntry("A"), CancellationToken.None).Wait()
        Assert.False(q.MoveAsync("A", 1, CancellationToken.None).Result)
    }

    @Fact
    func Clear_Removes_All() {
        var q = ExpInMemoryQueueService()
        q.AddAsync(makeEntry("A"), CancellationToken.None).Wait()
        q.AddAsync(makeEntry("B"), CancellationToken.None).Wait()
        q.ClearAsync(CancellationToken.None).Wait()
        Assert.Equal[int32](0, q.ListAsync(CancellationToken.None).Result.Count)
    }

    @Fact
    func Implements_Interface() {
        var q = ExpInMemoryQueueService()
        Assert.IsAssignableFrom[IExpQueueService](q)
    }
}
