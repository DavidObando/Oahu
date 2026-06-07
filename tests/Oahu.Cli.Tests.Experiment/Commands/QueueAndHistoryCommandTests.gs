// G# port of Commands/QueueAndHistoryCommandTests.cs (FAILED — no tests portable).
//
// Both tests require constructing QueueEntry and JobRecord which have
// required init-only properties (Asin, Title, Id, TerminalPhase, StartedAt,
// CompletedAt). G# 0.1.431 cannot set init-only properties: object-initializer
// syntax T() { Prop = v } doesn't parse, and post-construction assignment
// compiles but throws MissingMethodException at runtime.
//
// Additionally, HistoryCommand.ToDictionary output includes nullable field
// "quality" from JobRecord.Quality (DownloadQuality?) which cannot be
// constructed or asserted on due to gsharp#504/gsharp#517.

package Oahu.Cli.Tests.Experiment.Commands

import Xunit

type QueueAndHistoryCommandTests class {
    @Fact
    func Placeholder_DocumentsBlockingLimitations() {
        // All real tests blocked by init-only property limitation.
        // QueueEntry requires: Asin (required init), Title (required init)
        // JobRecord requires: Id, Asin, Title, TerminalPhase, StartedAt, CompletedAt (all required init)
        Assert.True(true)
    }
}
