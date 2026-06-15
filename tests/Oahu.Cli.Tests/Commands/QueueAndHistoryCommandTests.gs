// G# port of Commands/QueueAndHistoryCommandTests.cs.
// Both tests recovered: init-only props on QueueEntry/JobRecord work in 0.1.516.

package Oahu.Cli.Tests.Commands

import System
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import Xunit

class QueueAndHistoryCommandTests {
    @Fact
    func QueueCommand_ToDictionary_HasStableKeys() {
        let entry = QueueEntry() { Asin = "A1", Title = "Book" }
        let dict = QueueCommand.ToDictionary(entry)
        Assert.Equal("A1", dict["asin"])
        Assert.Equal("Book", dict["title"])
        Assert.Equal("High", dict["quality"])
        Assert.True(dict.ContainsKey("addedAt"))
        Assert.True(dict.ContainsKey("profileAlias"))
    }

    @Fact
    func HistoryCommand_ToDictionary_MapsTerminalPhaseToStatusString() {
        let rec = JobRecord() {
            Id = "j1",
            Asin = "A1",
            Title = "Book",
            TerminalPhase = JobPhase.Failed,
            StartedAt = DateTimeOffset.UtcNow.AddMinutes(-5),
            CompletedAt = DateTimeOffset.UtcNow,
            ErrorMessage = "boom",
        }
        let dict = HistoryCommand.ToDictionary(rec)
        Assert.Equal("j1", dict["id"])
        Assert.Equal("Failed", dict["status"])
        Assert.Equal("boom", dict["errorMessage"])
    }
}
