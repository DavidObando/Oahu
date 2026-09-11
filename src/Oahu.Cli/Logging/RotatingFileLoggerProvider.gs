package Oahu.Cli.Logging

import Microsoft.Extensions.Logging
import Oahu.Cli.App.Paths
import System
import System.Collections.Concurrent
import System.IO
import SystemObject = System.Object

/// Daily-rotating file (cref:ILoggerProvider) that writes to
/// `<CliPaths.LogDir>/oahu-cli-YYYYMMDD.log`.
///
/// Phase 1 deliberately uses a tiny self-contained provider (no Serilog / NLog
/// dependency) — Phase 7 may swap this for Serilog if structured sinks become
/// useful for the Logs overlay.
///
/// Thread-safe: writes are serialised through a single (cref:lock); the
/// log file is rotated lazily when the date changes.
class RotatingFileLoggerProvider : ILoggerProvider {
    private let minimumLevel LogLevel
    private let directory string
    private let writeLock object = SystemObject()
    private let loggers ConcurrentDictionary[string, RotatingFileLogger] = ConcurrentDictionary[
        string,
        RotatingFileLogger
    ]()
    private var currentDate DateOnly
    private var writer StreamWriter?
    private var disposed bool

    init(minimumLevel LogLevel = LogLevel.Information, directory string? = nil) {
        this.minimumLevel = minimumLevel
        this.directory = directory ?? CliPaths.LogDir
    }

    func CreateLogger(categoryName string) ILogger -> loggers.GetOrAdd(
        categoryName,
        (name string) -> RotatingFileLogger(name, this)
    )

    func Dispose() {
        if disposed {
            return
        }
        disposed = true
        lock writeLock {
            try {
                writer?.Flush()
                writer?.Dispose()
            } catch {
                // best effort

            }
            writer = nil
        }
    }

    func Write(category string, level LogLevel, eventId EventId, message string, exception Exception?) {
        if level < minimumLevel || disposed {
            return
        }
        let ts = DateTimeOffset.Now
        let line = FormatLine(ts, level, category, eventId, message, exception)
        lock writeLock {
            try {
                EnsureWriterFor(ts.Date)
                writer!!.WriteLine(line)
                if level >= LogLevel.Warning {
                    writer!!.Flush()
                }
            } catch {
                // Logging must never crash the CLI. Drop silently.

            }
        }
    }

    prop MinimumLevel LogLevel -> minimumLevel

    private func EnsureWriterFor(localDate DateTime) {
        let d = DateOnly.FromDateTime(localDate)
        if writer != nil && d == currentDate {
            return
        }
        try {
            writer?.Flush()
            writer?.Dispose()
        } catch {
            // ignore

        }
        Directory.CreateDirectory(directory)
        let path = Path.Combine(directory, "oahu-cli-${d:yyyyMMdd}.log")
        let stream = FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read)
        writer = StreamWriter(stream){AutoFlush = false}
        currentDate = d
    }

    private class RotatingFileLogger : ILogger {
        private let category string
        private let provider RotatingFileLoggerProvider

        init(category string, provider RotatingFileLoggerProvider) {
            this.category = category
            this.provider = provider
        }

        func BeginScope[TState](state TState) IDisposable -> NullScope.Instance

        func IsEnabled(logLevel LogLevel) bool -> logLevel >= provider.MinimumLevel

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
            let msg = formatter(state, exception)
            provider.Write(category, logLevel, eventId, msg, exception)
        }

        private class NullScope : IDisposable {
            func Dispose() { }

            shared {
                let Instance NullScope = NullScope()
            }
        }
    }

    shared {
        private func FormatLine(
            ts DateTimeOffset,
            level LogLevel,
            category string,
            eventId EventId,
            message string,
            exception Exception?
        ) string {
            let lvl = switch level {
                case LogLevel.Trace: "TRC"
                case LogLevel.Debug: "DBG"
                case LogLevel.Information: "INF"
                case LogLevel.Warning: "WRN"
                case LogLevel.Error: "ERR"
                case LogLevel.Critical: "CRT"
                default: "???"
            }
            var head = "${ts:yyyy-MM-ddTHH:mm:ss.fffzzz} $lvl [$category]"
            if eventId.Id != 0 || !string.IsNullOrEmpty(eventId.Name) {
                head += " (${eventId.Id}/${eventId.Name})"
            }
            let body = if exception == nil {
                "$head $message"
            } else {
                "$head $message${Environment.NewLine}$exception"
            }
            return body
        }
    }
}
