// Sanity tests for ExpJsonFileQueueService.

package Oahu.Cli.Tests.Experiment.Queue

import Xunit
import System
import System.IO
import System.Threading
import Oahu.Cli.App.Models
import Oahu.Cli.App.Experiment.Queue

type ExpJsonFileQueueServiceTests class {
    tempFile string = Path.Combine(Path.GetTempPath(), "oahu-cli-q-" + Guid.NewGuid().ToString("N") + ".json")

    func cleanup() {
        if File.Exists(tempFile) {
            File.Delete(tempFile)
        }
        var lp = tempFile + ".lock"
        if File.Exists(lp) {
            File.Delete(lp)
        }
    }

    func makeEntry(asin string) QueueEntry {
        return QueueEntry() { Asin = asin, Title = "T " + asin, Quality = DownloadQuality.High }
    }

    @Fact
    func Path_Returns_Configured_Path() {
        defer cleanup()
        var q = ExpJsonFileQueueService() { FilePath = tempFile }
        Assert.Equal(tempFile, q.Path())
    }

    @Fact
    func Empty_List_When_File_Missing() {
        defer cleanup()
        var q = ExpJsonFileQueueService() { FilePath = tempFile }
        Assert.Equal[int32](0, q.ListAsync(CancellationToken.None).Result.Count)
    }

    @Fact
    func Add_Persists_Across_Instances() {
        defer cleanup()
        var q1 = ExpJsonFileQueueService() { FilePath = tempFile }
        Assert.True(q1.AddAsync(makeEntry("A1"), CancellationToken.None).Result)
        var q2 = ExpJsonFileQueueService() { FilePath = tempFile }
        Assert.Equal[int32](1, q2.ListAsync(CancellationToken.None).Result.Count)
    }

    @Fact
    func Move_Persists() {
        defer cleanup()
        var q = ExpJsonFileQueueService() { FilePath = tempFile }
        q.AddAsync(makeEntry("A"), CancellationToken.None).Wait()
        q.AddAsync(makeEntry("B"), CancellationToken.None).Wait()
        Assert.True(q.MoveAsync("A", 1, CancellationToken.None).Result)
        var lst = q.ListAsync(CancellationToken.None).Result
        Assert.Equal("B", lst[0].Asin)
    }

    @Fact
    func Clear_Empties_File() {
        defer cleanup()
        var q = ExpJsonFileQueueService() { FilePath = tempFile }
        q.AddAsync(makeEntry("A"), CancellationToken.None).Wait()
        q.ClearAsync(CancellationToken.None).Wait()
        Assert.Equal[int32](0, q.ListAsync(CancellationToken.None).Result.Count)
    }

    @Fact
    func Implements_Interface() {
        defer cleanup()
        var q = ExpJsonFileQueueService() { FilePath = tempFile }
        Assert.IsAssignableFrom[IExpQueueService](q)
    }
}
