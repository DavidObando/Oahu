package Oahu.Cli.Tests.Tui

import System
import Microsoft.Extensions.Logging
import Oahu.Cli.Tui.Logging
import Xunit

class LogRingBufferTests {
    @Fact
    func Append_Then_Snapshot_Is_Chronological() {
        let buf = LogRingBuffer(capacity: 3)
        buf.Append(LogEntry(DateTimeOffset.UtcNow, LogLevel.Information, "cat", "one", nil))
        buf.Append(LogEntry(DateTimeOffset.UtcNow, LogLevel.Warning, "cat", "two", nil))
        buf.Append(LogEntry(DateTimeOffset.UtcNow, LogLevel.Error, "cat", "three", nil))
        let snap = buf.Snapshot()
        Assert.Equal(3, snap.Count)
        Assert.Equal("one", snap[0].Message)
        Assert.Equal("two", snap[1].Message)
        Assert.Equal("three", snap[2].Message)
    }

    @Fact
    func Append_Beyond_Capacity_Drops_Oldest() {
        let buf = LogRingBuffer(capacity: 2)
        buf.Append(LogEntry(DateTimeOffset.UtcNow, LogLevel.Information, "cat", "one", nil))
        buf.Append(LogEntry(DateTimeOffset.UtcNow, LogLevel.Information, "cat", "two", nil))
        buf.Append(LogEntry(DateTimeOffset.UtcNow, LogLevel.Information, "cat", "three", nil))
        let snap = buf.Snapshot()
        Assert.Equal(2, snap.Count)
        Assert.Equal("two", snap[0].Message)
        Assert.Equal("three", snap[1].Message)
    }

    @Fact
    func Logger_Provider_Drops_Below_Minimum_Level() {
        let buf = LogRingBuffer(capacity: 8, minimumLevel: LogLevel.Warning)
        let logger = buf.CreateLogger("x")
        logger.LogInformation("nope")
        logger.LogWarning("yes")
        logger.LogError("yes2")
        let snap = buf.Snapshot()
        Assert.Equal(2, snap.Count)
        Assert.Equal("yes", snap[0].Message)
        Assert.Equal("yes2", snap[1].Message)
    }

    @Fact
    func Clear_Drops_All_Entries() {
        let buf = LogRingBuffer(capacity: 4)
        buf.Append(LogEntry(DateTimeOffset.UtcNow, LogLevel.Information, "x", "a", nil))
        buf.Append(LogEntry(DateTimeOffset.UtcNow, LogLevel.Information, "x", "b", nil))
        buf.Clear()
        Assert.Empty(buf.Snapshot())
        Assert.Equal(0, buf.Count)
    }

    @Fact
    func FormatLine_Includes_Level_And_Message() {
        let entry = LogEntry(
            DateTimeOffset(2026, 4, 25, 12, 0, 0, TimeSpan.Zero),
            LogLevel.Warning,
            "Cat",
            "Hello",
            nil
        )
        let line = entry.FormatLine()
        Assert.Contains("WRN", line)
        Assert.Contains("Cat", line)
        Assert.Contains("Hello", line)
    }
}
