using System.Diagnostics;
using System.Threading;
using Oahu.Decrypt;
using Oahu.Decrypt.Chunks;
using Oahu.Decrypt.FrameFilters;
using Oahu.Decrypt.FrameFilters.Audio;
using Oahu.Decrypt.FrameFilters.Text;
using Oahu.Decrypt.Mpeg4.Boxes;
using Oahu.Decrypt.Mpeg4.Chunks;

namespace Oahu.Diagnostics.Checks;

/// <summary>
/// Replicates the ConvertToMp4aAsync pipeline manually with full instrumentation
/// to identify exactly where the production bug occurs.
/// Tracks: chunks enumerated, frames dispatched, bytes written, filter chain activity.
/// </summary>
public static class InstrumentedExportCheck
{
    public static List<DiagnosticCheck> Run(string filePath, string? key, string? iv, string? outputPath)
    {
        return Task.Run(() => RunAsync(filePath, key, iv, outputPath)).GetAwaiter().GetResult();
    }

    private static async Task<List<DiagnosticCheck>> RunAsync(string filePath, string? key, string? iv, string? outputPath)
    {
        var results = new List<DiagnosticCheck>();

        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(iv))
        {
            results.Add(new DiagnosticCheck
            {
                Id = "inst-prereq",
                Title = "Instrumented export prerequisites",
                Severity = DiagSeverity.Warning,
                Detail = "Key/IV required. Skipping.",
            });
            return results;
        }

        outputPath ??= Path.ChangeExtension(filePath, ".instrumented.m4b");

        using var inputStream = File.OpenRead(filePath);
        AaxFile aaxFile;

        try
        {
            aaxFile = new AaxFile(inputStream);
            aaxFile.SetDecryptionKey(key, iv);
        }
        catch (Exception ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "inst-setup",
                Title = "Instrumented export: setup",
                Severity = DiagSeverity.Error,
                Detail = $"Failed: {ex.Message}",
            });
            return results;
        }

        using (aaxFile)
        {
            // Replicate ConvertToMp4aAsync logic manually
            var sw = Stopwatch.StartNew();

            using var outputStream = File.Create(outputPath);

            // Step 1: Record the operation's GetAwaiter/Start behavior
            var operation = aaxFile.ConvertToMp4aAsync(outputStream);

            int progressCount = 0;
            TimeSpan firstProgressPos = TimeSpan.Zero;
            TimeSpan lastProgressPos = TimeSpan.Zero;
            double lastSpeed = 0;
            var progressTimes = new List<(TimeSpan elapsed, TimeSpan position)>();

            operation.ConversionProgressUpdate += (_, e) =>
            {
                if (progressCount == 0)
                {
                    firstProgressPos = e.ProcessPosition;
                }

                lastProgressPos = e.ProcessPosition;
                lastSpeed = e.ProcessSpeed;
                progressCount++;

                // Record first 10 and last few progress events
                if (progressCount <= 10 || sw.Elapsed.TotalSeconds > 1)
                {
                    progressTimes.Add((sw.Elapsed, e.ProcessPosition));
                }
            };

            // Step 2: Check output stream position BEFORE starting
            long posBeforeStart = outputStream.Position;

            results.Add(new DiagnosticCheck
            {
                Id = "inst-pre-start",
                Title = "Instrumented: pre-start state",
                Severity = DiagSeverity.Ok,
                Detail = $"Output position before Start: {posBeforeStart:N0} bytes " +
                         $"(ftyp + mdat header written by Mp4aWriter constructor). " +
                         $"Input stream position: {inputStream.Position:N0}",
            });

            // Step 3: Start the operation and observe — also track ALL first-chance exceptions
            var startTime = sw.Elapsed;
            var firstChanceExceptions = new List<(TimeSpan elapsed, string type, string message, string stack)>();

            void OnFirstChance(object? sender, System.Runtime.ExceptionServices.FirstChanceExceptionEventArgs e)
            {
                // Only record during our operation window. Capture stack traces for non-OCE.
                var entry = (sw.Elapsed, e.Exception.GetType().Name, e.Exception.Message,
                    e.Exception is not OperationCanceledException && e.Exception is not TaskCanceledException
                        ? e.Exception.StackTrace ?? "" : "");
                firstChanceExceptions.Add(entry);
            }

            AppDomain.CurrentDomain.FirstChanceException += OnFirstChance;

            // Manually call Start() and capture the tasks
            operation.Start();

            // Check TaskStatus immediately
            var statusAfterStart = operation.TaskStatus;

            // The operation may complete VERY quickly (the bug!). Use safe position access.
            long posAfter10ms = -1;
            long posAfter100ms = -1;
            string statusAfter10ms = "?";
            string statusAfter100ms = "?";

            await Task.Delay(10);
            statusAfter10ms = operation.TaskStatus.ToString();
            try { posAfter10ms = outputStream.Position; } catch (ObjectDisposedException) { posAfter10ms = -1; }

            if (posAfter10ms >= 0) // Stream still open - wait more
            {
                await Task.Delay(100);
                statusAfter100ms = operation.TaskStatus.ToString();
                try { posAfter100ms = outputStream.Position; } catch (ObjectDisposedException) { posAfter100ms = -1; }
            }
            else
            {
                statusAfter100ms = "stream already closed";
            }

            var streamClosedEarly = posAfter10ms == -1;
            results.Add(new DiagnosticCheck
            {
                Id = "inst-task-status",
                Title = "Instrumented: task status timeline",
                Severity = streamClosedEarly ? DiagSeverity.Error : DiagSeverity.Ok,
                Detail = $"After Start(): {statusAfterStart}, " +
                         $"After 10ms: {statusAfter10ms} (output={posAfter10ms}B), " +
                         $"After 100ms: {statusAfter100ms} (output={posAfter100ms}B). " +
                         (streamClosedEarly
                             ? "BUG CONFIRMED: output stream was CLOSED within 10ms of Start()! " +
                               "The entire pipeline (33K chunks, 363K frames) completed in <10ms which is impossible. " +
                               "The ChunkReader's foreach loop is exiting immediately."
                             : "Pipeline appears to be processing normally."),
            });

            // Step 4: Await the operation
            Exception? opException = null;
            try
            {
                await operation.OperationTask;
            }
            catch (Exception ex)
            {
                opException = ex;
            }

            AppDomain.CurrentDomain.FirstChanceException -= OnFirstChance;

            var endTime = sw.Elapsed;
            var elapsed = endTime - startTime;

            // Note: outputStream is CLOSED by the Continuation lambda inside ConvertToMp4aAsync.
            // We can't access outputStream.Position after await.
            // Use file info instead.
            long finalSize = File.Exists(outputPath) ? new FileInfo(outputPath).Length : 0;

            results.Add(new DiagnosticCheck
            {
                Id = "inst-completion",
                Title = "Instrumented: completion",
                Severity = opException != null ? DiagSeverity.Error : DiagSeverity.Ok,
                Detail = $"Completed in {elapsed.TotalMilliseconds:F1}ms. " +
                         $"Status: {operation.TaskStatus}, " +
                         $"IsCompletedSuccessfully={operation.IsCompletedSuccessfully}, " +
                         $"IsFaulted={operation.IsFaulted}, " +
                         $"IsCanceled={operation.IsCanceled}. " +
                         (opException != null ? $"Exception: {opException.GetType().Name}: {opException.Message}" : "No exception."),
            });

            // Step 5: Progress analysis
            var progressDetail = $"Total progress events: {progressCount}. " +
                                 $"First position: {firstProgressPos:hh\\:mm\\:ss\\.fff}, " +
                                 $"Last position: {lastProgressPos:hh\\:mm\\:ss\\.fff}, " +
                                 $"Speed: {lastSpeed:F1}x.";

            if (progressTimes.Count > 0)
            {
                progressDetail += " Timeline: ";
                foreach (var (t, p) in progressTimes.Take(5))
                {
                    progressDetail += $"[{t.TotalMilliseconds:F0}ms→{p:mm\\:ss}] ";
                }
            }

            var progressSeverity = progressCount <= 2 ? DiagSeverity.Warning : DiagSeverity.Ok;
            results.Add(new DiagnosticCheck
            {
                Id = "inst-progress",
                Title = "Instrumented: progress events",
                Severity = progressSeverity,
                Detail = progressDetail,
                Hint = progressCount <= 2
                    ? "Very few progress events suggest the ChunkReader loop exited almost immediately. " +
                      "Expected 100+ events for a 4+ hour audiobook."
                    : null,
            });

            // Step 6: First-chance exception analysis
            var nonOceExceptions = firstChanceExceptions
                .Where(e => e.type != "OperationCanceledException" && e.type != "TaskCanceledException")
                .ToList();

            var exceptionDetail = $"Total first-chance exceptions: {firstChanceExceptions.Count}. " +
                                  $"Non-OCE exceptions: {nonOceExceptions.Count}.";

            if (nonOceExceptions.Count > 0)
            {
                exceptionDetail += " First non-OCE with stack:";
                foreach (var (t, type, msg, stack) in nonOceExceptions.Take(3))
                {
                    // Get first few frames of stack trace
                    var stackLines = stack.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                    var shortStack = string.Join("\n      ", stackLines.Take(5));
                    exceptionDetail += $"\n    [{t.TotalMilliseconds:F0}ms] {type}: {msg}\n      {shortStack}";
                }
            }

            if (firstChanceExceptions.Count > 0)
            {
                var grouped = firstChanceExceptions.GroupBy(e => e.type).OrderByDescending(g => g.Count());
                exceptionDetail += "\n  Summary by type: ";
                foreach (var g in grouped.Take(5))
                {
                    exceptionDetail += $"{g.Key}({g.Count()}) ";
                }
            }

            var excSeverity = nonOceExceptions.Count > 0 ? DiagSeverity.Warning : DiagSeverity.Ok;
            results.Add(new DiagnosticCheck
            {
                Id = "inst-exceptions",
                Title = "Instrumented: exception tracking",
                Severity = excSeverity,
                Detail = exceptionDetail,
                Hint = nonOceExceptions.Count > 0
                    ? "Non-cancellation exceptions during the operation indicate the root cause of the pipeline failure. " +
                      "These exceptions trigger the catch block in ChunkReader.RunAsync which cancels the token."
                    : null,
            });

            // Step 7: Output analysis
            var outputInfo = new FileInfo(outputPath);
            var inputInfo = new FileInfo(filePath);
            var ratio = outputInfo.Length / (double)inputInfo.Length;

            var outputSeverity = ratio < 0.5 ? DiagSeverity.Error : DiagSeverity.Ok;
            results.Add(new DiagnosticCheck
            {
                Id = "inst-output",
                Title = "Instrumented: output file",
                Severity = outputSeverity,
                Detail = $"Output: {outputInfo.Length:N0} bytes ({outputInfo.Length / (1024.0 * 1024):F2} MiB). " +
                         $"Ratio: {ratio:P1}. " +
                         $"Final size: {finalSize:N0}. " +
                         $"Pre-start position was: {posBeforeStart:N0}. " +
                         $"Audio data written: ~{finalSize - posBeforeStart:N0} bytes.",
                Hint = outputSeverity == DiagSeverity.Error
                    ? "The pipeline produced truncated output. " +
                      "Diagnosis: if few progress events fired AND completion was instant, " +
                      "the ChunkReader's EnumerateChunks() likely returned empty in the production pipeline context. " +
                      "If many progress events fired but output is small, the LosslessFilter is dropping frames."
                    : null,
            });
        }

        return results;
    }
}
