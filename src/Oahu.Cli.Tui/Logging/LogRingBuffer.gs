package Oahu.Cli.Tui.Logging

import Microsoft.Extensions.Logging
import System
import System.Collections.Concurrent
import System.Collections.Generic
import SystemObject = System.Object

/// One captured log record, ready to render in the Logs overlay.
data struct LogEntry(Timestamp DateTimeOffset, Level LogLevel, Category string, Message string, Exception string?) {
    func FormatLine() string {
        let lvl = switch Level {
            case LogLevel.Trace: "TRC"
            case LogLevel.Debug: "DBG"
            case LogLevel.Information: "INF"
            case LogLevel.Warning: "WRN"
            case LogLevel.Error: "ERR"
            case LogLevel.Critical: "CRT"
            default: "???"
        }
        let head = "${Timestamp:HH:mm:ss.fff} $lvl [$Category] $Message"
        return if Exception == nil {
            head
        } else {
            head + " — " + Exception
        }
    }
}

/// In-memory ring buffer of (cref:LogEntry) records that doubles as an
/// (cref:ILoggerProvider). Used by the TUI Logs overlay so that the user
/// can press `L` and inspect logs that were emitted while they were
/// looking at another screen.
///
/// Thread-safe: writes lock the ring; reads take a snapshot.
class LogRingBuffer : ILoggerProvider {
    private let writeLock object = SystemObject()
    private let ring[]LogEntry
    private let minimumLevel LogLevel
    private let loggers ConcurrentDictionary[string, RingLogger] = ConcurrentDictionary[string, RingLogger]()
    private var head int32
    private var count int32
    private var disposed bool

    init(capacity int32 = 500, minimumLevel LogLevel = LogLevel.Information) {
        if capacity <= 0 {
            throw ArgumentOutOfRangeException("capacity", "Capacity must be positive.")
        }
        ring = [capacity]LogEntry
        this.minimumLevel = minimumLevel
    }

    prop Capacity int32 -> ring.Length

    prop Count int32 {
        get {
            lock writeLock {
                return count
            }
        }
    }

    prop MinimumLevel LogLevel -> minimumLevel

    func CreateLogger(categoryName string) ILogger -> loggers.GetOrAdd(
        categoryName,
        (name string) -> RingLogger(name, this)
    )

    /// Append an entry. Older entries are evicted when the ring is full.
    func Append(entry LogEntry) {
        if disposed {
            return
        }
        lock writeLock {
            ring[head] = entry
            head = (head + 1) % ring.Length
            if count < ring.Length {
                count++
            }
        }
    }

    /// Returns a snapshot of the entries in chronological order (oldest first).
    func Snapshot() IReadOnlyList[LogEntry] {
        lock writeLock {
            let result = [count]LogEntry
            // Oldest entry sits at (head - count) mod len.
            let start = (head - count + ring.Length) % ring.Length
            for var i = 0;
            i < count;
            i++ {
                result[i] = ring[(start + i) % ring.Length]
            }
            return result
        }
    }

    func Clear() {
        lock writeLock {
            head = 0
            count = 0
        }
    }

    func Dispose() {
        disposed = true
    }

    private class RingLogger : ILogger {
        private let category string
        private let owner LogRingBuffer

        init(category string, owner LogRingBuffer) {
            this.category = category
            this.owner = owner
        }

        func BeginScope[TState](state TState) IDisposable -> LogRingBuffer.RingLogger.NullScope.Instance

        func IsEnabled(logLevel LogLevel) bool -> logLevel >= owner.minimumLevel

        func Log[TState](
            logLevel LogLevel,
            eventId EventId,
            state TState,
            exception Exception?,
            formatter(TState, Exception?) -> string
        ) {
            if !IsEnabled(logLevel) {
                return
            }
            ArgumentNullException.ThrowIfNull(formatter)
            let msg = formatter(state, exception)
            owner.Append(LogEntry(DateTimeOffset.Now, logLevel, category, msg, exception?.ToString()))
        }

        private class NullScope : IDisposable {
            func Dispose() { }

            shared {
                let Instance LogRingBuffer.RingLogger.NullScope = LogRingBuffer.RingLogger.NullScope()
            }
        }
    }

    shared {
        /// Default capacity (entries). Older entries are dropped on overflow.
        const DefaultCapacity int32 = 500
    }
}
