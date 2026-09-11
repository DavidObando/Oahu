package Oahu.Cli.Tests.Server

import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Server.Tools
import System
import System.Collections.Generic
import System.IO
import System.Text.Json
import System.Threading.Tasks
import Xunit

class OahuToolsTests {
    @Fact
    async func LibraryList_Returns_Items_And_Total() {
        let lib = FakeLibraryService(
            []LibraryItem{LibraryItem{Asin: "B1", Title: "Foundation"}, LibraryItem{Asin: "B2", Title: "Dune"}}
        )
        let t = Build(lib: lib)
        let result = Json(await t.LibraryListAsync(filter: nil, limit: nil))
        Assert.Equal(2, result.GetProperty("total").GetInt32())
        Assert.Equal(2, result.GetProperty("items").GetArrayLength())
    }

    @Fact
    async func LibraryShow_Throws_KeyNotFound_For_Unknown_Asin() {
        let t = Build()
        await Assert.ThrowsAsync[KeyNotFoundException](
            func () Task {
                return t.LibraryShowAsync("MISSING")
            }
        )
    }

    @Fact
    async func QueueAdd_Then_QueueList_Roundtrip() {
        let queue = InMemoryQueueService()
        let t = Build(queue: queue)
        let add = Json(await t.QueueAddAsync([]string{"B1", "B2"}))
        Assert.Equal(2, add.GetProperty("added").GetArrayLength())
        let list = Json(await t.QueueListAsync())
        Assert.Equal(2, list.GetProperty("total").GetInt32())
    }

    @Fact
    async func QueueAdd_Skips_Duplicates() {
        let queue = InMemoryQueueService()
        let t = Build(queue: queue)
        await t.QueueAddAsync([]string{"B1"})
        let again = Json(await t.QueueAddAsync([]string{"B1", "B2"}))
        Assert.Equal(1, again.GetProperty("skipped").GetArrayLength())
        Assert.Equal(1, again.GetProperty("added").GetArrayLength())
    }

    @Fact
    async func Download_Returns_JobId_And_Snapshot_Visible() {
        await using let sched = JobScheduler(FakeJobExecutor(delayPerPhase: TimeSpan.FromMilliseconds(50)))
        let t = Build(jobs: sched)
        let accepted = Json(await t.DownloadAsync([]string{"B1"}))
        Assert.Equal(1, accepted.GetProperty("accepted").GetArrayLength())
        await Task.Delay(20)
        let status = Json(await t.JobsStatusAsync(jobId: nil))
        Assert.True(status.GetProperty("total").GetInt32() >= 1)
    }

    @Fact
    async func ConfigGet_Returns_Defaults_When_Key_Omitted() {
        let t = Build()
        let all = Json(await t.ConfigGetAsync(key: nil))
        Assert.True(all.TryGetProperty("config", out _))
        Assert.True(all.TryGetProperty("path", out _))
    }

    @Fact
    async func History_Show_Throws_KeyNotFound_For_Unknown_Job() {
        let t = Build()
        await Assert.ThrowsAsync[KeyNotFoundException](
            func () Task {
                return t.HistoryShowAsync("nonexistent")
            }
        )
    }

    shared {
        private func Build(
            auth IAuthService? = nil,
            lib ILibraryService? = nil,
            queue IQueueService? = nil,
            jobs IJobService? = nil
        ) OahuTools -> OahuTools(
            auth ?? FakeAuthService(),
            lib ?? FakeLibraryService(),
            queue ?? InMemoryQueueService(),
            jobs ?? JobScheduler(FakeJobExecutor()),
            JsonConfigService(Path.Combine(Path.GetTempPath(), "oahu-tools-cfg-${Guid.NewGuid():n}.json")),
            DoctorService()
        )

        private func Json(o object) JsonElement -> JsonSerializer.SerializeToElement(o)
    }
}
