// G# port of App/JsonFileQueueServiceTests.cs.
//
// Recovery (0.1.516): QueueEntry init-only props now construct via object
// initializer. Full suite ported.

package Oahu.Cli.Tests.App

import System
import System.Collections.Generic
import System.IO
import System.Linq
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Xunit

class JsonFileQueueServiceTests {
    var tempFile string

    init() {
        tempFile = Path.Combine(Path.GetTempPath(), "oahu-cli-queue-${Guid.NewGuid().ToString("n")}.json")
    }

    func cleanup() {
        if File.Exists(tempFile) {
            File.Delete(tempFile)
        }
        let tmp = tempFile + ".tmp"
        if File.Exists(tmp) {
            File.Delete(tmp)
        }
        let lockFile = tempFile + ".lock"
        if File.Exists(lockFile) {
            File.Delete(lockFile)
        }
    }

    func Sample(asin string) QueueEntry {
        return QueueEntry() { Asin = asin, Title = "Book ${asin}" }
    }

    func AsinsOf(list IReadOnlyList[QueueEntry]) []string {
        var arr = []string{}
        var tmp = List[string]()
        for e in list {
            tmp.Add(e.Asin)
        }
        return tmp.ToArray()
    }

    @Fact
    func List_Empty_When_File_Missing() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        var list = svc.ListAsync().Result
        Assert.Empty(list)
    }

    @Fact
    func Add_Then_List_Persists_Across_Instances() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        Assert.True(svc.AddAsync(Sample("A1")).Result)
        Assert.True(svc.AddAsync(Sample("A2")).Result)

        var fresh = JsonFileQueueService(tempFile)
        let list = fresh.ListAsync().Result
        Assert.Equal[IEnumerable[string]]([]string{"A1", "A2"}, AsinsOf(list))
    }

    @Fact
    func Add_Returns_False_For_Duplicate_Asin() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        Assert.True(svc.AddAsync(Sample("A1")).Result)
        Assert.False(svc.AddAsync(Sample("a1")).Result)
        Assert.Single(svc.ListAsync().Result)
    }

    @Fact
    func Remove_Returns_False_When_Missing() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        var result = svc.RemoveAsync("missing").Result
        Assert.False(result)
    }

    @Fact
    func Remove_Persists() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        svc.AddAsync(Sample("A1")).Wait()
        svc.AddAsync(Sample("A2")).Wait()
        Assert.True(svc.RemoveAsync("A1").Result)

        var fresh = JsonFileQueueService(tempFile)
        Assert.Equal[IEnumerable[string]]([]string{"A2"}, AsinsOf(fresh.ListAsync().Result))
    }

    @Fact
    func Clear_Empties_The_Queue() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        svc.AddAsync(Sample("A1")).Wait()
        svc.ClearAsync().Wait()
        Assert.Empty(svc.ListAsync().Result)
        Assert.False(File.Exists(tempFile + ".tmp"))
    }

    @Fact
    func MoveAsync_Swaps_Adjacent_Entries_And_Persists() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        svc.AddAsync(Sample("A1")).Wait()
        svc.AddAsync(Sample("A2")).Wait()
        svc.AddAsync(Sample("A3")).Wait()

        Assert.True(svc.MoveAsync("A1", 1).Result)
        Assert.Equal[IEnumerable[string]]([]string{"A2", "A1", "A3"}, AsinsOf(svc.ListAsync().Result))

        Assert.True(svc.MoveAsync("A3", -1).Result)
        Assert.Equal[IEnumerable[string]]([]string{"A2", "A3", "A1"}, AsinsOf(svc.ListAsync().Result))

        var fresh = JsonFileQueueService(tempFile)
        Assert.Equal[IEnumerable[string]]([]string{"A2", "A3", "A1"}, AsinsOf(fresh.ListAsync().Result))
    }

    @Fact
    func MoveAsync_Returns_False_At_Boundaries_Or_Unknown() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        svc.AddAsync(Sample("A1")).Wait()
        svc.AddAsync(Sample("A2")).Wait()

        Assert.False(svc.MoveAsync("A1", -1).Result)
        Assert.False(svc.MoveAsync("A2", 1).Result)
        Assert.False(svc.MoveAsync("missing", 1).Result)
        Assert.Equal[IEnumerable[string]]([]string{"A1", "A2"}, AsinsOf(svc.ListAsync().Result))
    }

    @Fact
    func MoveAsync_Preserves_AddedAt_Of_Other_Entries() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        let when = DateTimeOffset.UtcNow.AddDays(-1)
        svc.AddAsync(QueueEntry() { Asin = "A1", Title = "First", AddedAt = when }).Wait()
        svc.AddAsync(QueueEntry() { Asin = "A2", Title = "Second", AddedAt = when.AddMinutes(10) }).Wait()

        Assert.True(svc.MoveAsync("A1", 1).Result)

        let list = svc.ListAsync().Result
        Assert.Equal("A2", list[0].Asin)
        Assert.Equal(when.AddMinutes(10), list[0].AddedAt)
        Assert.Equal("A1", list[1].Asin)
        Assert.Equal(when, list[1].AddedAt)
    }
}
