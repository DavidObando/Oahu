// G# port of Tui/LogRingBufferTests.cs.
//
// Tests the LogRingBuffer ring-buffer behavior: append, overflow eviction,
// minimum-level filtering, clear, and FormatLine output.
//
// LIMITATIONS:
// - LogEntry is a `readonly record struct` with primary ctor; G# cannot
//   construct it directly (GS0130). Tests that need LogEntry construction
//   use CreateLogger + Log* methods to inject entries indirectly.
// - .Count on IReadOnlyList[T] doesn't bind; use Linq Count() extension.

package Oahu.Cli.Tests.Tui

import System
import System.Linq
import Microsoft.Extensions.Logging
import Oahu.Cli.Tui.Logging
import Xunit

class LogRingBufferTests {
    @Fact
    func Append_Then_Snapshot_Is_Chronological() {
        var buf = LogRingBuffer(3)
        var logger = buf.CreateLogger("cat")
        logger.LogInformation("one")
        logger.LogWarning("two")
        logger.LogError("three")

        var snap = buf.Snapshot()
        Assert.Equal(3, snap.Count())
        Assert.Equal("one", snap[0].Message)
        Assert.Equal("two", snap[1].Message)
        Assert.Equal("three", snap[2].Message)
    }

    @Fact
    func Append_Beyond_Capacity_Drops_Oldest() {
        var buf = LogRingBuffer(2)
        var logger = buf.CreateLogger("cat")
        logger.LogInformation("one")
        logger.LogInformation("two")
        logger.LogInformation("three")

        var snap = buf.Snapshot()
        Assert.Equal(2, snap.Count())
        Assert.Equal("two", snap[0].Message)
        Assert.Equal("three", snap[1].Message)
    }

    @Fact
    func Logger_Provider_Drops_Below_Minimum_Level() {
        var buf = LogRingBuffer(8, LogLevel.Warning)
        var logger = buf.CreateLogger("x")
        logger.LogInformation("nope")
        logger.LogWarning("yes")
        logger.LogError("yes2")

        var snap = buf.Snapshot()
        Assert.Equal(2, snap.Count())
        Assert.Equal("yes", snap[0].Message)
        Assert.Equal("yes2", snap[1].Message)
    }

    @Fact
    func Clear_Drops_All_Entries() {
        var buf = LogRingBuffer(4)
        var logger = buf.CreateLogger("x")
        logger.LogInformation("a")
        logger.LogInformation("b")
        buf.Clear()
        Assert.Empty(buf.Snapshot())
        Assert.Equal(0, buf.Count)
    }

    @Fact
    func FormatLine_Includes_Level_And_Message() {
        // Use CreateLogger to inject an entry, then inspect the snapshot.
        var buf = LogRingBuffer(4)
        var logger = buf.CreateLogger("Cat")
        logger.LogWarning("Hello")

        var snap = buf.Snapshot()
        Assert.Equal(1, snap.Count())
        var line = snap[0].FormatLine()
        Assert.Contains("WRN", line)
        Assert.Contains("Cat", line)
        Assert.Contains("Hello", line)
    }
}
