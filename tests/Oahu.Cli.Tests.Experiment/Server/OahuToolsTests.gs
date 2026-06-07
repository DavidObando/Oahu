// G# port of Server/OahuToolsTests.cs (PARTIAL).
//
// LIMITATION: LibraryList_Returns_Items_And_Total requires constructing LibraryItem
// with init-only properties which throws MissingMethodException at runtime in G# 0.1.431.
// LIMITATION: Download_Returns_JobId_And_Snapshot_Visible uses IAsyncDisposable (await using).
// LIMITATION: Tests that assert on JsonElement properties are skipped — G# 0.1.431 cannot
// bind instance members (GetProperty, GetArrayLength, GetInt32, ValueKind) on the JsonElement
// struct type (GS0159 / GS0158).
// LIMITATION: GetAwaiter() on Task[object] is ambiguous (GS0160) — use .Result instead.
//
// NOTE (G# 0.1.431, gsharp#502): async func not usable; Tasks blocked with .Result.

package Oahu.Cli.Tests.Experiment.Server

import System
import System.Collections.Generic
import System.IO
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Queue
import Oahu.Cli.Server.Tools
import Xunit

type OahuToolsTests class {
    func makeTools() OahuTools {
        var cfgPath = Path.Combine(Path.GetTempPath(), "oahu-tools-cfg-" + Guid.NewGuid().ToString("N") + ".json")
        return OahuTools(
            FakeAuthService(),
            FakeLibraryService(),
            InMemoryQueueService(),
            JobScheduler(FakeJobExecutor()),
            JsonConfigService(cfgPath),
            DoctorService())
    }

    func makeToolsWithQueue(queue InMemoryQueueService) OahuTools {
        var cfgPath = Path.Combine(Path.GetTempPath(), "oahu-tools-cfg-" + Guid.NewGuid().ToString("N") + ".json")
        return OahuTools(
            FakeAuthService(),
            FakeLibraryService(),
            queue,
            JobScheduler(FakeJobExecutor()),
            JsonConfigService(cfgPath),
            DoctorService())
    }

    // SKIPPED: LibraryList_Returns_Items_And_Total — blocked by LibraryItem init-only props.
    // SKIPPED: QueueAdd_Then_QueueList_Roundtrip — blocked by JsonElement member binding.
    // SKIPPED: QueueAdd_Skips_Duplicates — blocked by JsonElement member binding.
    // SKIPPED: Download_Returns_JobId_And_Snapshot_Visible — blocked by IAsyncDisposable.
    // SKIPPED: ConfigGet_Returns_Defaults_When_Key_Omitted — blocked by JsonElement member binding.

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
