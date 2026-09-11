package Oahu.Cli.Tests.App

import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import System
import System.IO
import System.Linq
import System.Threading.Tasks
import Xunit

class JsonFileQueueServiceTests : IDisposable {
    private let tempFile string

    init() {
        tempFile = Path.Combine(Path.GetTempPath(), "oahu-cli-queue-${Guid.NewGuid():n}.json")
    }

    func Dispose() {
        if File.Exists(tempFile) {
            File.Delete(tempFile)
        }
        let tmp = tempFile + ".tmp"
        if File.Exists(tmp) {
            File.Delete(tmp)
        }
    }

    private func Sample(asin string) QueueEntry -> QueueEntry{Asin: asin, Title: "Book $asin"}

    @Fact
    async func List_Empty_When_File_Missing() {
        let svc = JsonFileQueueService(tempFile)
        Assert.Empty(await svc.ListAsync())
    }

    @Fact
    async func Add_Then_List_Persists_Across_Instances() {
        let svc = JsonFileQueueService(tempFile)
        Assert.True(await svc.AddAsync(Sample("A1")))
        Assert.True(await svc.AddAsync(Sample("A2")))
        let fresh = JsonFileQueueService(tempFile)
        let list = await fresh.ListAsync()
        Assert.Equal([]string{"A1", "A2"}, list.Select((e QueueEntry) -> e.Asin).ToArray())
    }

    @Fact
    async func Add_Returns_False_For_Duplicate_Asin() {
        let svc = JsonFileQueueService(tempFile)
        Assert.True(await svc.AddAsync(Sample("A1")))
        Assert.False(await svc.AddAsync(Sample("a1")))
        Assert.Single(await svc.ListAsync())
    }

    @Fact
    async func Remove_Returns_False_When_Missing() {
        let svc = JsonFileQueueService(tempFile)
        Assert.False(await svc.RemoveAsync("missing"))
    }

    @Fact
    async func Remove_Persists() {
        let svc = JsonFileQueueService(tempFile)
        await svc.AddAsync(Sample("A1"))
        await svc.AddAsync(Sample("A2"))
        Assert.True(await svc.RemoveAsync("A1"))
        let fresh = JsonFileQueueService(tempFile)
        Assert.Equal([]string{"A2"}, (await fresh.ListAsync()).Select((e QueueEntry) -> e.Asin).ToArray())
    }

    @Fact
    async func Clear_Empties_The_Queue() {
        let svc = JsonFileQueueService(tempFile)
        await svc.AddAsync(Sample("A1"))
        await svc.ClearAsync()
        Assert.Empty(await svc.ListAsync())
        Assert.False(File.Exists(tempFile + ".tmp"))
    }

    @Fact
    async func MoveAsync_Swaps_Adjacent_Entries_And_Persists() {
        let svc = JsonFileQueueService(tempFile)
        await svc.AddAsync(Sample("A1"))
        await svc.AddAsync(Sample("A2"))
        await svc.AddAsync(Sample("A3"))
        Assert.True(await svc.MoveAsync("A1", + 1))
        Assert.Equal([]string{"A2", "A1", "A3"}, (await svc.ListAsync()).Select((e QueueEntry) -> e.Asin).ToArray())
        Assert.True(await svc.MoveAsync("A3", -1))
        Assert.Equal([]string{"A2", "A3", "A1"}, (await svc.ListAsync()).Select((e QueueEntry) -> e.Asin).ToArray())
        let fresh = JsonFileQueueService(tempFile)
        Assert.Equal([]string{"A2", "A3", "A1"}, (await fresh.ListAsync()).Select((e QueueEntry) -> e.Asin).ToArray())
    }

    @Fact
    async func MoveAsync_Returns_False_At_Boundaries_Or_Unknown() {
        let svc = JsonFileQueueService(tempFile)
        await svc.AddAsync(Sample("A1"))
        await svc.AddAsync(Sample("A2"))
        Assert.False(await svc.MoveAsync("A1", -1))
        Assert.False(await svc.MoveAsync("A2", + 1))
        Assert.False(await svc.MoveAsync("missing", + 1))
        Assert.Equal([]string{"A1", "A2"}, (await svc.ListAsync()).Select((e QueueEntry) -> e.Asin).ToArray())
    }

    @Fact
    async func MoveAsync_Preserves_AddedAt_Of_Other_Entries() {
        let svc = JsonFileQueueService(tempFile)
        let when = DateTimeOffset.UtcNow.AddDays(-1)
        await svc.AddAsync(QueueEntry{Asin: "A1", Title: "First", AddedAt: when})
        await svc.AddAsync(QueueEntry{Asin: "A2", Title: "Second", AddedAt: when.AddMinutes(10.0)})
        Assert.True(await svc.MoveAsync("A1", + 1))
        let list = await svc.ListAsync()
        Assert.Equal("A2", list[0].Asin)
        Assert.Equal(when.AddMinutes(10.0), list[0].AddedAt)
        Assert.Equal("A1", list[1].Asin)
        Assert.Equal(when, list[1].AddedAt)
    }
}
