// G# port of Commands/HistoryRetryCommandTests.cs.
// Recovers nullable-enum Quality roundtrip via manual IAsyncEnumerable enumerator
// (blocking with .GetAwaiter().GetResult()).
//
// NOTE: Retry_UnknownId still requires Func<ILoggerFactory> + interface upcast to
// ILoggerFactory which the current G# binding can't express cleanly; left to a later pass.

package Oahu.Cli.Tests.Experiment.Commands

import System
import System.IO
import System.Text.RegularExpressions
import System.Threading
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Xunit

type HistoryRetryCommandTests class {
    @Fact
    func JobRecord_InitOnly_Properties_SetViaObjectInitializer() {
        var rec = JobRecord() {
            Id = "test1",
            Asin = "B9999",
            Title = "Test Book",
            TerminalPhase = JobPhase.Failed,
            StartedAt = DateTimeOffset.UtcNow,
            CompletedAt = DateTimeOffset.UtcNow,
            ErrorMessage = "simulated"
        }
        Assert.Equal("test1", rec.Id)
        Assert.Equal("B9999", rec.Asin)
        Assert.Equal("Test Book", rec.Title)
        Assert.Equal(JobPhase.Failed, rec.TerminalPhase)
        Assert.Equal("simulated", rec.ErrorMessage)
    }

    @Fact
    func JobRecord_Quality_Defaults_To_Null_When_Not_Set() {
        var rec = JobRecord() {
            Id = "n1",
            Asin = "B0",
            Title = "T",
            TerminalPhase = JobPhase.Completed,
            StartedAt = DateTimeOffset.UtcNow,
            CompletedAt = DateTimeOffset.UtcNow
        }
        Assert.Null(rec.Quality)
    }

    @Fact
    func JobRecord_ProfileAlias_Is_Optional() {
        var rec = JobRecord() {
            Id = "p1",
            Asin = "B1",
            Title = "Test",
            TerminalPhase = JobPhase.Completed,
            StartedAt = DateTimeOffset.UtcNow,
            CompletedAt = DateTimeOffset.UtcNow,
            ProfileAlias = "myprofile"
        }
        Assert.Equal("myprofile", rec.ProfileAlias)
    }

    @Fact
    async func JobRecord_Quality_Roundtrips_Through_JsonlHistoryStore() {
        var path = Path.Combine(Path.GetTempPath(), "oahu-cli-retry-" + Guid.NewGuid().ToString("N") + ".jsonl")
        try {
            var store = JsonlHistoryStore(path)
            var rec = JobRecord() {
                Id = "abc123",
                Asin = "B0001",
                Title = "Hail Mary",
                TerminalPhase = JobPhase.Completed,
                StartedAt = DateTimeOffset.UtcNow.AddMinutes(float64(-1)),
                CompletedAt = DateTimeOffset.UtcNow,
                ProfileAlias = "default",
                Quality = DownloadQuality.Extreme
            }
            store.Append(rec)

            var list = await readAll(store)
            Assert.Single(list)
            let read = list[0]
            Assert.True(read.Quality.HasValue)
            Assert.Equal(DownloadQuality.Extreme, read.Quality.Value)
            Assert.Equal("abc123", read.Id)
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }

    @Fact
    async func JobRecord_Without_Quality_Deserializes_As_Null() {
        var path = Path.Combine(Path.GetTempPath(), "oahu-cli-retry-" + Guid.NewGuid().ToString("N") + ".jsonl")
        try {
            var store = JsonlHistoryStore(path)
            store.Append(JobRecord() {
                Id = "old1",
                Asin = "B0",
                Title = "T",
                TerminalPhase = JobPhase.Completed,
                StartedAt = DateTimeOffset.Parse("2025-01-01T00:00:00Z"),
                CompletedAt = DateTimeOffset.Parse("2025-01-01T00:01:00Z")
            })
            var raw = File.ReadAllText(path)
            raw = Regex.Replace(raw, ",\\s*\"quality\"\\s*:\\s*null", "")
            File.WriteAllText(path, raw)

            var list = await readAll(store)
            Assert.Single(list)
            Assert.Null(list[0].Quality)
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }

    async func readAll(store JsonlHistoryStore) List[JobRecord] {
        var list = List[JobRecord]()
        await for rec in store.ReadAllAsync(CancellationToken.None) {
            list.Add(rec)
        }
        return list
    }
}
