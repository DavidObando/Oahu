// G# port of Commands/HistoryRetryCommandTests.cs — PARTIAL for 0.1.459.
// Init-only properties on JobRecord now work via object-initializer syntax.
//
// LIMITATIONS:
// - Setting Quality (DownloadQuality?) to non-null triggers GS9998 ICE.
//   Quality round-trip test reduced to verifying null default.
// - JsonlHistoryStore also triggers GS9998 (IAsyncEnumerable generic).
// - Retry_UnknownId needs CommandLine Parse/InvokeAsync (extension methods).

package Oahu.Cli.Tests.Experiment.Commands

import System
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
}
