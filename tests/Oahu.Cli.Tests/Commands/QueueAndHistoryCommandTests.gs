package Oahu.Cli.Tests.Commands

import Oahu.Cli.App.Models
import Oahu.Cli.App.Jobs
import Oahu.Cli.Commands
import System
import System.IO
import System.Reflection
import System.Threading
import System.Threading.Tasks
import Xunit

class QueueAndHistoryCommandTests {
    @Theory
    @InlineData(0, 5)
    @InlineData(2, 3)
    @InlineData(8, 1)
    async func History_DryRun_Count_Matches_Real_Delete_With_Combined_Filters(keep int32, expected int32) {
        let path = Path.Combine(Path.GetTempPath(), "oahu-delete-preview-" + Guid.NewGuid().ToString("N"))
        try {
            let store = JsonlHistoryStore(path)
            for var i = 0; i < 5; i++ {
                store.Append(JobRecord{
                    Id: "job-$i", Asin: "A$i", Title: "Title", TerminalPhase: JobPhase.Completed,
                    CompletedAt: DateTimeOffset.UtcNow.AddMinutes(i)
                })
            }
            let method = typeof(HistoryCommand).GetMethod("CountDeletionsAsync", BindingFlags.NonPublic | BindingFlags.Static)!!
            let preview = await cast[Task[int32]](method.Invoke(nil, []object?{
                store, []string{"a0"}, nil, keep, CancellationToken.None
            })!!)
            Assert.Equal(expected, preview)
            Assert.Equal(5, File.ReadAllLines(path).Length)
            Assert.Equal(preview, await store.DeleteAsync([]string{"a0"}, keep: keep))
        } finally {
            File.Delete(path)
        }
    }

    @Fact
    func QueueCommand_ToDictionary_HasStableKeys() {
        let entry = QueueEntry{Asin: "A1", Title: "Book"}
        let dict = QueueCommand.ToDictionary(entry)
        Assert.Equal("A1", dict["asin"])
        Assert.Equal("Book", dict["title"])
        Assert.Equal("High", dict["quality"])
        Assert.True(dict.ContainsKey("addedAt"))
        Assert.True(dict.ContainsKey("profileAlias"))
    }

    @Fact
    func HistoryCommand_ToDictionary_MapsTerminalPhaseToStatusString() {
        let rec = JobRecord{
            Id: "j1",
            Asin: "A1",
            Title: "Book",
            TerminalPhase: JobPhase.Failed,
            StartedAt: DateTimeOffset.UtcNow.AddMinutes(-5),
            CompletedAt: DateTimeOffset.UtcNow,
            ErrorMessage: "boom"
        }
        let dict = HistoryCommand.ToDictionary(rec)
        Assert.Equal("j1", dict["id"])
        Assert.Equal("Failed", dict["status"])
        Assert.Equal("boom", dict["errorMessage"])
    }
}
