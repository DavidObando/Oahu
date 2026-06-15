// G# port of Server/OahuToolsTests.cs.

package Oahu.Cli.Tests.Server

import System
import System.Collections.Generic
import System.IO
import System.Text.Json
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Server.Tools
import Xunit

class OahuToolsTests {
    func makeTools() OahuTools {
        return buildTools(nil, nil, nil, nil)
    }

    func makeToolsWithQueue(queue InMemoryQueueService) OahuTools {
        return buildTools(nil, nil, queue, nil)
    }

    func buildTools(auth IAuthService?, lib ILibraryService?, queue IQueueService?, jobs IJobService?) OahuTools {
        let cfgPath = Path.Combine(Path.GetTempPath(), "oahu-tools-cfg-" + Guid.NewGuid().ToString("N") + ".json")
        let defaultAuth IAuthService = FakeAuthService()
        let defaultLib ILibraryService = FakeLibraryService()
        let defaultQueue IQueueService = InMemoryQueueService()
        let defaultJobs IJobService = JobScheduler(FakeJobExecutor())
        let resolvedAuth IAuthService = auth ?: defaultAuth
        let resolvedLib ILibraryService = lib ?: defaultLib
        let resolvedQueue IQueueService = queue ?: defaultQueue
        let resolvedJobs IJobService = jobs ?: defaultJobs
        return OahuTools(
            resolvedAuth,
            resolvedLib,
            resolvedQueue,
            resolvedJobs,
            JsonConfigService(cfgPath),
            DoctorService())
    }

    func toJson(o object) JsonElement {
        return JsonSerializer.SerializeToElement(o)
    }

    @Fact
    func LibraryList_Returns_Items_And_Total() {
        let seed = List[LibraryItem]()
        seed.Add(LibraryItem() { Asin = "B1", Title = "Foundation" })
        seed.Add(LibraryItem() { Asin = "B2", Title = "Dune" })
        let seq IEnumerable[LibraryItem] = seed
        let lib ILibraryService = FakeLibraryService(seq)
        let t = buildTools(nil, lib, nil, nil)
        let result = toJson(t.LibraryListAsync(nil, nil, CancellationToken.None).Result)
        Assert.Equal(2, result.GetProperty("total").GetInt32())
        Assert.Equal(2, result.GetProperty("items").GetArrayLength())
    }

    @Fact
    func LibraryShow_Throws_KeyNotFound_For_Unknown_Asin() {
        var t = makeTools()
        var threw = false
        try {
            var r = t.LibraryShowAsync("MISSING").Result
        } catch (e AggregateException) {
            threw = true
            Assert.IsType[KeyNotFoundException](e.InnerException)
        }
        Assert.True(threw)
    }

    @Fact
    func QueueAdd_Then_QueueList_Roundtrip() {
        let queue = InMemoryQueueService()
        let t = makeToolsWithQueue(queue)
        let add = toJson(t.QueueAddAsync([]string{"B1", "B2"}, nil, nil, nil, CancellationToken.None).Result)
        Assert.Equal(2, add.GetProperty("added").GetArrayLength())

        let list = toJson(t.QueueListAsync(CancellationToken.None).Result)
        Assert.Equal(2, list.GetProperty("total").GetInt32())
    }

    @Fact
    func QueueAdd_Skips_Duplicates() {
        let queue = InMemoryQueueService()
        let t = makeToolsWithQueue(queue)
        let ignored = t.QueueAddAsync([]string{"B1"}, nil, nil, nil, CancellationToken.None).Result
        let again = toJson(t.QueueAddAsync([]string{"B1", "B2"}, nil, nil, nil, CancellationToken.None).Result)
        Assert.Equal(1, again.GetProperty("skipped").GetArrayLength())
        Assert.Equal(1, again.GetProperty("added").GetArrayLength())
    }

    @Fact
    func Download_Returns_JobId_And_Snapshot_Visible() {
        let sched = JobScheduler(FakeJobExecutor(Nullable[TimeSpan](TimeSpan.FromMilliseconds(50)), false))
        try {
            let t = buildTools(nil, nil, nil, sched)
            let accepted = toJson(t.DownloadAsync([]string{"B1"}, nil, nil, false, nil, CancellationToken.None).Result)
            Assert.Equal(1, accepted.GetProperty("accepted").GetArrayLength())
            Task.Delay(20).GetAwaiter().GetResult()
            let status = toJson(t.JobsStatusAsync(nil, CancellationToken.None).Result)
            Assert.True(status.GetProperty("total").GetInt32() >= 1)
        } finally {
            sched.DisposeAsync().AsTask().GetAwaiter().GetResult()
        }
    }

    @Fact
    func ConfigGet_Returns_Defaults_When_Key_Omitted() {
        let t = makeTools()
        let all = toJson(t.ConfigGetAsync(nil, CancellationToken.None).Result)
        var cfg JsonElement = JsonElement()
        var path JsonElement = JsonElement()
        Assert.True(all.TryGetProperty("config", &cfg))
        Assert.True(all.TryGetProperty("path", &path))
    }

    @Fact
    func History_Show_Throws_KeyNotFound_For_Unknown_Job() {
        var t = makeTools()
        var threw = false
        try {
            var r = t.HistoryShowAsync("nonexistent").Result
        } catch (e AggregateException) {
            threw = true
            Assert.IsType[KeyNotFoundException](e.InnerException)
        }
        Assert.True(threw)
    }
}
