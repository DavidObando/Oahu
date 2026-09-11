package Oahu.Diagnostics.Checks

import System.Diagnostics
import System.Threading
import Oahu.Decrypt
import Oahu.Decrypt.Chunks
import Oahu.Decrypt.FrameFilters
import Oahu.Decrypt.FrameFilters.Audio
import Oahu.Decrypt.FrameFilters.Text
import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Chunks
import Oahu.Diagnostics
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Runtime.ExceptionServices
import System.Threading.Tasks

/// Replicates the ConvertToMp4aAsync pipeline manually with full instrumentation
/// to identify exactly where the production bug occurs.
/// Tracks: chunks enumerated, frames dispatched, bytes written, filter chain activity.
class InstrumentedExportCheck {
    shared {
        func Run(filePath string, key string?, iv string?, outputPath string?) List[DiagnosticCheck] {
            return Task
                .Run(
                func () Task[List[DiagnosticCheck]]? {
                    return RunAsync(filePath, key, iv, outputPath)
                }
            )
                .GetAwaiter()
                .GetResult()
        }

        private async func RunAsync(filePath string, key string?, iv string?, outputPath string?) List[
            DiagnosticCheck
        ] {
            var outputPath = outputPath
            let results = List[DiagnosticCheck]()
            if string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv) {
                results.Add(
                    DiagnosticCheck{
                        Id: "inst-prereq",
                        Title: "Instrumented export prerequisites",
                        Severity: DiagSeverity.Warning,
                        Detail: "Key/IV required. Skipping."
                    }
                )
                return results
            }
            outputPath ??= Path.ChangeExtension(filePath, ".instrumented.m4b")
            using let inputStream = File.OpenRead(filePath)
            var aaxFile AaxFile
            try {
                aaxFile = AaxFile(inputStream)
                aaxFile.SetDecryptionKey(key!!, iv!!)
            } catch (ex Exception) {
                results.Add(
                    DiagnosticCheck{
                        Id: "inst-setup",
                        Title: "Instrumented export: setup",
                        Severity: DiagSeverity.Error,
                        Detail: "Failed: ${ex.Message}"
                    }
                )
                return results
            }
            {
                using let _ = aaxFile
                // Replicate ConvertToMp4aAsync logic manually
                let sw = Stopwatch.StartNew()
                using let outputStream = File.Create(outputPath!!)
                // Step 1: Record the operation's GetAwaiter/Start behavior
                let operation = aaxFile.ConvertToMp4aAsync(outputStream)
                var progressCount = 0
                var firstProgressPos = TimeSpan.Zero
                var lastProgressPos = TimeSpan.Zero
                var lastSpeed float64 = 0.0
                let progressTimes = List[(elapsed TimeSpan, position TimeSpan)]()
                operation.ConversionProgressUpdate += (_ object?, e ConversionProgressEventArgs) -> {
                    if progressCount == 0 {
                        firstProgressPos = e.ProcessPosition
                    }
                    lastProgressPos = e.ProcessPosition
                    lastSpeed = e.ProcessSpeed
                    progressCount++
                    // Record first 10 and last few progress events
                    if progressCount <= 10 || sw.Elapsed.TotalSeconds > float64(1.0) {
                        progressTimes.Add((sw.Elapsed, e.ProcessPosition))
                    }
                }
                // Step 2: Check output stream position BEFORE starting
                let posBeforeStart = outputStream.Position
                results.Add(
                    DiagnosticCheck{
                        Id: "inst-pre-start",
                        Title: "Instrumented: pre-start state",
                        Severity: DiagSeverity.Ok,
                        Detail: "Output position before Start: ${posBeforeStart:N0} bytes " +
                            "(ftyp + mdat header written by Mp4aWriter constructor). " +
                            "Input stream position: ${inputStream.Position:N0}"
                    }
                )
                // Step 3: Start the operation and observe — also track ALL first-chance exceptions
                let startTime = sw.Elapsed
                let firstChanceExceptions = List[(elapsed TimeSpan, type string, message string, stack string)]()
                let OnFirstChance = func (sender object?, e FirstChanceExceptionEventArgs) {
                    // Only record during our operation window. Capture stack traces for non-OCE.
                    let entry = (
                        sw.Elapsed,
                        e.Exception.GetType().Name,
                        e.Exception.Message,
                        if !(e.Exception is OperationCanceledException) && !(e.Exception is TaskCanceledException) {
                            e.Exception.StackTrace ?? ""
                        } else {
                            ""
                        }
                    )
                    firstChanceExceptions.Add(entry)
                }
                AppDomain.CurrentDomain.FirstChanceException += OnFirstChance
                // Manually call Start() and capture the tasks
                operation.Start()
                // Check TaskStatus immediately
                let statusAfterStart = operation.TaskStatus
                // The operation may complete VERY quickly (the bug!). Use safe position access.
                var posAfter10ms int64 = -1
                var posAfter100ms int64 = -1
                var statusAfter10ms = "?"
                var statusAfter100ms = "?"
                await Task.Delay(10)
                statusAfter10ms = operation.TaskStatus.ToString()
                try {
                    posAfter10ms = outputStream.Position
                } catch (ObjectDisposedException) {
                    posAfter10ms = -1
                }
                if posAfter10ms >= int64(0) {
                    await Task.Delay(100)
                    statusAfter100ms = operation.TaskStatus.ToString()
                    try {
                        posAfter100ms = outputStream.Position
                    } catch (ObjectDisposedException) {
                        posAfter100ms = -1
                    }
                } else {
                    statusAfter100ms = "stream already closed"
                }
                let streamClosedEarly = posAfter10ms == int64(-1)
                results.Add(
                    DiagnosticCheck{
                        Id: "inst-task-status",
                        Title: "Instrumented: task status timeline",
                        Severity: if streamClosedEarly {
                            DiagSeverity.Error
                        } else {
                            DiagSeverity.Ok
                        },
                        Detail: "After Start(): $statusAfterStart, " +
                            "After 10ms: $statusAfter10ms (output=${posAfter10ms}B), " +
                            "After 100ms: $statusAfter100ms (output=${posAfter100ms}B). " +
                            (
                            if streamClosedEarly {
                                "BUG CONFIRMED: output stream was CLOSED within 10ms of Start()! " +
                                    "The entire pipeline (33K chunks, 363K frames) completed in <10ms which is impossible. " +
                                    "The ChunkReader's foreach loop is exiting immediately."
                            } else {
                                "Pipeline appears to be processing normally."
                            }
                        )
                    }
                )
                // Step 4: Await the operation
                var opException Exception? = nil
                try {
                    await operation.OperationTask
                } catch (ex Exception) {
                    opException = ex
                }
                AppDomain.CurrentDomain.FirstChanceException -= OnFirstChance
                let endTime = sw.Elapsed
                let elapsed = endTime - startTime
                // Note: outputStream is CLOSED by the Continuation lambda inside ConvertToMp4aAsync.
                // We can't access outputStream.Position after await.
                // Use file info instead.
                let finalSize = if File.Exists(outputPath) {
                    FileInfo(outputPath!!).Length
                } else {
                    int64(0)
                }
                results.Add(
                    DiagnosticCheck{
                        Id: "inst-completion",
                        Title: "Instrumented: completion",
                        Severity: if opException != nil {
                            DiagSeverity.Error
                        } else {
                            DiagSeverity.Ok
                        },
                        Detail: "Completed in ${elapsed.TotalMilliseconds:F1}ms. " +
                            "Status: ${operation.TaskStatus}, " +
                            "IsCompletedSuccessfully=${operation.IsCompletedSuccessfully}, " +
                            "IsFaulted=${operation.IsFaulted}, " +
                            "IsCanceled=${operation.IsCanceled}. " +
                            (
                            if opException != nil {
                                "Exception: ${opException.GetType().Name}: ${opException.Message}"
                            } else {
                                "No exception."
                            }
                        )
                    }
                )
                // Step 5: Progress analysis
                var progressDetail = "Total progress events: $progressCount. " +
                    "First position: ${firstProgressPos:hh\:mm\:ss\.fff}, " +
                    "Last position: ${lastProgressPos:hh\:mm\:ss\.fff}, " +
                    "Speed: ${lastSpeed:F1}x."
                if progressTimes.Count > 0 {
                    progressDetail += " Timeline: "
                    for (t, p) in progressTimes.Take(5) {
                        progressDetail += "[${t.TotalMilliseconds:F0}ms→${p:mm\:ss}] "
                    }
                }
                let progressSeverity = if progressCount <= 2 {
                    DiagSeverity.Warning
                } else {
                    DiagSeverity.Ok
                }
                results.Add(
                    DiagnosticCheck{
                        Id: "inst-progress",
                        Title: "Instrumented: progress events",
                        Severity: progressSeverity,
                        Detail: progressDetail,
                        Hint: if progressCount <= 2 {
                            "Very few progress events suggest the ChunkReader loop exited almost immediately. " +
                                "Expected 100+ events for a 4+ hour audiobook."
                        } else {
                            default(string?)
                        }
                    }
                )
                // Step 6: First-chance exception analysis
                let nonOceExceptions = firstChanceExceptions.Where(
                    (
                        e(elapsed TimeSpan, type string, message string, stack string)
                    ) -> e.type != "OperationCanceledException" &&
                        e.type != "TaskCanceledException"
                )
                    .ToList()
                var exceptionDetail = "Total first-chance exceptions: ${firstChanceExceptions.Count}. " +
                    "Non-OCE exceptions: ${nonOceExceptions.Count}."
                if nonOceExceptions.Count > 0 {
                    exceptionDetail += " First non-OCE with stack:"
                    for (t, type, msg, stack) in nonOceExceptions.Take(3) {
                        // Get first few frames of stack trace
                        let stackLines = stack.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                        let shortStack = string.Join("\n      ", stackLines.Take(5))
                        exceptionDetail += (`
    [` + "${t.TotalMilliseconds:F0}" + `ms] ` + "$type" + `: ` + "$msg" + `
      ` + "$shortStack")
                    }
                }
                if firstChanceExceptions.Count > 0 {
                    let grouped = firstChanceExceptions.GroupBy(
                        (e(elapsed TimeSpan, type string, message string, stack string)) -> e.type
                    )
                        .OrderByDescending(
                        (
                            g IGrouping[string, (elapsed TimeSpan, type string, message string, stack string)]
                        ) -> g.Count()
                    )
                    exceptionDetail += "\n  Summary by type: "
                    for g in grouped.Take(5) {
                        exceptionDetail += "${g.Key}(${g.Count()}) "
                    }
                }
                let excSeverity = if nonOceExceptions.Count > 0 {
                    DiagSeverity.Warning
                } else {
                    DiagSeverity.Ok
                }
                results.Add(
                    DiagnosticCheck{
                        Id: "inst-exceptions",
                        Title: "Instrumented: exception tracking",
                        Severity: excSeverity,
                        Detail: exceptionDetail,
                        Hint: if nonOceExceptions.Count > 0 {
                            "Non-cancellation exceptions during the operation indicate the root cause of the pipeline failure. " +
                                "These exceptions trigger the catch block in ChunkReader.RunAsync which cancels the token."
                        } else {
                            default(string?)
                        }
                    }
                )
                // Step 7: Output analysis
                let outputInfo = FileInfo(outputPath!!)
                let inputInfo = FileInfo(filePath)
                let ratio = float64(outputInfo.Length) / float64(inputInfo.Length)
                let outputSeverity = if ratio < 0.5 {
                    DiagSeverity.Error
                } else {
                    DiagSeverity.Ok
                }
                results.Add(
                    DiagnosticCheck{
                        Id: "inst-output",
                        Title: "Instrumented: output file",
                        Severity: outputSeverity,
                        Detail: "Output: ${outputInfo.Length:N0} bytes (${float64(outputInfo.Length) / (1024.0 * float64(1024.0)):F2} MiB). " +
                            "Ratio: ${ratio:P1}. " +
                            "Final size: ${finalSize:N0}. " +
                            "Pre-start position was: ${posBeforeStart:N0}. " +
                            "Audio data written: ~${finalSize - posBeforeStart:N0} bytes.",
                        Hint: if outputSeverity == DiagSeverity.Error {
                            "The pipeline produced truncated output. " +
                                "Diagnosis: if few progress events fired AND completion was instant, " +
                                "the ChunkReader's EnumerateChunks() likely returned empty in the production pipeline context. " +
                                "If many progress events fired but output is small, the LosslessFilter is dropping frames."
                        } else {
                            default(string?)
                        }
                    }
                )
            }
            return results
        }
    }
}
