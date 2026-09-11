package Oahu.Cli.Commands

import Oahu.Cli
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Queue
import Oahu.Cli.Output
import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

/// `oahu-cli download <asin>...`.
///
/// Submits one or more ASINs to the (cref:IJobService) and waits for
/// every job to reach a terminal phase. JSON mode streams one
/// `download-update` document per (cref:JobUpdate) followed by a
/// final `download-summary`; Pretty/Plain emits a per-phase line per
/// ASIN and a summary table.
///
/// Exit codes (per design §10):
/// `0` all jobs completed successfully.
/// `1` at least one job ended in (cref:JobPhase.Failed) or (cref:JobPhase.Canceled).
/// `2` usage error (handled by (cref:ParseErrorRewriter)).
/// `3` no active profile / auth required (surfaced by the executor).
class DownloadCommand {
    /// Outcome of request resolution, including titles skipped as no longer owned.
    private data class ResolvedRequests(Requests IReadOnlyList[JobRequest], SkippedUnavailable int32) { }

    shared {
        const UpdateResource string = "download-update"
        const SummaryResource string = "download-summary"

        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let asinArg = Argument[[]string]("asin"){
                Arity = ArgumentArity.ZeroOrMore,
                Description = "One or more ASINs to download. Use '-' to read one ASIN per line from stdin."
            }
            let qualityOpt = Option[string?]("--quality"){
                Description = "Download quality: normal|high|extreme. Defaults to user setting."
            }
            let profileOpt = Option[string?]("--profile"){
                Description = "Profile alias to use (defaults to the active profile)."
            }
            let fromQueueOpt = Option[bool]("--from-queue"){
                Description = "Drain the shared download queue instead of taking ASIN positionals."
            }
            let exportOpt = Option[string?]("--export"){
                Description = "Post-decrypt export: 'none' (default), 'aax', 'm4b', or 'both'."
            }
            let outputDirOpt = Option[string?]("--output-dir"){
                Description = "Override the export directory (only used with --export aax|m4b|both)."
            }
            let concurrencyOpt = Option[int32?]("--concurrency"){
                Description = "Maximum parallel downloads (default: 1). Must be >= 1."
            }
            let noDecryptOpt = Option[bool]("--no-decrypt"){
                Description = "Stop after the LocalLocked phase; leave the encrypted .aax on disk."
            }
            let allNewOpt = Option[bool]("--all-new"){
                Description = "Submit all library items not yet recorded as successfully downloaded."
            }
            let limitOpt = Option[int32?]("--limit"){
                Description = "Cap the number of jobs submitted (only with --all-new). Default: 50."
            }
            let cmd = Command("download", "Download (and decrypt) one or more audiobooks by ASIN."){
                asinArg,
                qualityOpt,
                profileOpt,
                fromQueueOpt,
                exportOpt,
                outputDirOpt,
                concurrencyOpt,
                noDecryptOpt,
                allNewOpt,
                limitOpt
            }
            cmd.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let positional = parse.GetValue(asinArg) ?? Array.Empty[string]()
                    let fromQueue = parse.GetValue(fromQueueOpt)
                    let profile = parse.GetValue(profileOpt)
                    let qualityRaw = parse.GetValue(qualityOpt)
                    let exportRaw = parse.GetValue(exportOpt)
                    let outputDir = parse.GetValue(outputDirOpt)
                    let concurrency = parse.GetValue(concurrencyOpt)
                    let noDecrypt = parse.GetValue(noDecryptOpt)
                    let allNew = parse.GetValue(allNewOpt)
                    let limit = parse.GetValue(limitOpt) ?? 50
                    if concurrency is {} cVal && cVal < 1 {
                        CliEnvironment.Error.WriteLine("oahu-cli: --concurrency must be >= 1.")
                        return ExitCodes.UsageError
                    }
                    if limit < 1 {
                        CliEnvironment.Error.WriteLine("oahu-cli: --limit must be >= 1.")
                        return ExitCodes.UsageError
                    }
                    if allNew && (positional.Length > 0 || fromQueue) {
                        CliEnvironment.Error.WriteLine(
                            "oahu-cli: --all-new is mutually exclusive with positional ASINs and --from-queue."
                        )
                        return ExitCodes.UsageError
                    }
                    var quality DownloadQuality? = nil
                    if !string.IsNullOrEmpty(qualityRaw) {
                        if !Enum.TryParse[DownloadQuality](qualityRaw, ignoreCase: true, out var parsed) {
                            CliEnvironment.Error.WriteLine(
                                "oahu-cli: --quality '$qualityRaw' is not valid. Use one of: normal|high|extreme."
                            )
                            return ExitCodes.UsageError
                        }
                        quality = parsed
                    }
                    var exportToAax = false
                    var exportToM4b = false
                    if !string.IsNullOrEmpty(exportRaw) {
                        switch exportRaw.ToLowerInvariant() {
                            case "none" { }
                            case "aax" {
                                exportToAax = true
                            }
                            case "m4b" {
                                exportToM4b = true
                            }
                            case "both" {
                                exportToAax = true
                                exportToM4b = true
                            }
                            default {
                                CliEnvironment.Error.WriteLine(
                                    "oahu-cli: --export '$exportRaw' is not valid. Use one of: none|aax|m4b|both."
                                )
                                return ExitCodes.UsageError
                            }
                        }
                    }
                    let resolved = await ResolveRequestsAsync(
                        positional,
                        fromQueue,
                        allNew,
                        limit,
                        profile,
                        quality,
                        exportToAax,
                        exportToM4b,
                        noDecrypt,
                        outputDir,
                        globals.Force,
                        ct
                    ).ConfigureAwait(false)
                    let requests = resolved.Requests
                    if requests.Count == 0 {
                        if resolved.SkippedUnavailable > 0 {
                            // The per-title reasons have already gone to stderr.
                            CliEnvironment.Error.WriteLine(
                                "oahu-cli: nothing to download — ${resolved.SkippedUnavailable} title(s) are no longer in your library."
                            )
                            return ExitCodes.GenericFailure
                        }
                        if fromQueue {
                            CliEnvironment.Error.WriteLine("oahu-cli: queue is empty.")
                        } else {
                            CliEnvironment.Error.WriteLine(
                                "oahu-cli: no ASINs supplied. Pass ASINs as arguments or --from-queue."
                            )
                        }
                        return ExitCodes.UsageError
                    }
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    if globals.DryRun {
                        EmitDryRunPlan(writer, requests)
                        return ExitCodes.Success
                    }
                    if concurrency is {} cParallelism {
                        CliServiceFactory.OverrideMaxParallelism = cParallelism
                    }
                    let jobService = CliServiceFactory.JobServiceFactory()
                    return await RunAsync(jobService, requests, writer, ct).ConfigureAwait(false)
                }
            )
            return cmd
        }

        func EmitDryRunPlan(writer IOutputWriter, requests IReadOnlyList[JobRequest]) {
            let rows = List[IReadOnlyDictionary[string, object?]](requests.Count)
            for r in requests {
                rows.Add(
                    Dictionary[string, object?]{
                        ["asin"] = r.Asin,
                        ["title"] = r.Title,
                        ["quality"] = r.Quality.ToString(),
                        ["profile"] = r.ProfileAlias,
                        ["exportToAax"] = r.ExportToAax,
                        ["outputDir"] = r.OutputDir
                    }
                )
            }
            writer.WriteCollection(
                "download-plan",
                rows,
                []OutputColumn{
                    OutputColumn("asin", "ASIN"),
                    OutputColumn("title", "TITLE"),
                    OutputColumn("quality", "QUALITY"),
                    OutputColumn("exportToAax", "EXPORT")
                }
            )
        }

        async func RunAsync(
            jobService IJobService,
            requests IReadOnlyList[JobRequest],
            writer IOutputWriter,
            cancellationToken CancellationToken
        ) int32 {
            let ids = HashSet[string](requests.Select((r JobRequest) -> r.Id), StringComparer.Ordinal)
            let titlesById = requests.ToDictionary(
                (r JobRequest) -> r.Id,
                (r JobRequest) -> r.Title,
                StringComparer.Ordinal
            )
            let asinsById = requests.ToDictionary(
                (r JobRequest) -> r.Id,
                (r JobRequest) -> r.Asin,
                StringComparer.Ordinal
            )
            let terminals = ConcurrentDictionary[string, JobUpdate](StringComparer.Ordinal)
            let lastPhase = ConcurrentDictionary[string, JobPhase](StringComparer.Ordinal)
            // Subscribe BEFORE submitting so we don't miss the Queued update.
            // Call ObserveAll synchronously here (not inside Task.Run) so the
            // subscriber is registered before the first SubmitAsync.
            using let observerCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken)
            let stream = jobService.ObserveAll(observerCts.Token)
            let observerTask = Task.Run(
                async () -> {
                    await for u in stream.ConfigureAwait(false) {
                        if !ids.Contains(u.JobId) {
                            continue
                        }
                        EmitUpdate(writer, u, asinsById, titlesById)
                        lastPhase[u.JobId] = u.Phase
                        if IsTerminal(u.Phase) {
                            terminals[u.JobId] = u
                            if terminals.Count >= ids.Count {
                                break
                            }
                        }
                    }
                },
                CancellationToken.None
            )
            for req in requests {
                try {
                    await jobService.SubmitAsync(req, cancellationToken).ConfigureAwait(false)
                } catch (ex Exception) {
                    // Submission failure (e.g. scheduler disposed, channel closed). Cancel the
                    // observer so we don't hang waiting for terminals that will never arrive,
                    // and surface the failure for this request.
                    terminals[req.Id] = JobUpdate{JobId: req.Id, Phase: JobPhase.Failed, Message: ex.Message}
                    observerCts.Cancel()
                }
            }
            try {
                await observerTask.ConfigureAwait(false)
            } catch (OperationCanceledException) {
                // expected if we cancelled above

            } finally {
                observerCts.Cancel()
            }
            WriteSummary(writer, requests, terminals)
            let anyFailed = terminals.Values.Any((u JobUpdate) -> u.Phase == JobPhase.Failed)
            let anyCanceled = terminals.Values.Any((u JobUpdate) -> u.Phase == JobPhase.Canceled)
            let allCompleted = terminals.Count == ids.Count && terminals.Values.All(
                (u JobUpdate) -> u.Phase == JobPhase.Completed
            )
            if allCompleted {
                return ExitCodes.Success
            }
            if anyFailed {
                return ExitCodes.GenericFailure
            }
            if anyCanceled {
                // 130 = SIGINT-style termination per design §10.
                return ExitCodes.Cancelled
            }
            return ExitCodes.GenericFailure
        }

        private func IsTerminal(p JobPhase) bool -> p == JobPhase.Completed ||
            p == JobPhase.Failed ||
            p == JobPhase.Canceled

        private func EmitUpdate(
            writer IOutputWriter,
            u JobUpdate,
            asinsById IReadOnlyDictionary[string, string],
            titlesById IReadOnlyDictionary[string, string]
        ) {
            let asin = asinsById.GetValueOrDefault(u.JobId, string.Empty)
            let title = titlesById.GetValueOrDefault(u.JobId, string.Empty)
            if writer.Context.Format == OutputFormat.Json {
                // --quiet on JSON: still emit the final summary, but suppress per-update lines.
                if writer.Context.Quiet {
                    return
                }
                writer.WriteResource(
                    UpdateResource,
                    Dictionary[string, object?]{
                        ["jobId"] = u.JobId,
                        ["asin"] = asin,
                        ["title"] = title,
                        ["phase"] = u.Phase.ToString(),
                        ["progress"] = u.Progress,
                        ["message"] = u.Message,
                        ["timestamp"] = u.Timestamp
                    }
                )
                return
            }
            // Pretty/Plain: only print phase boundaries (not per-tick progress) so
            // the output stays readable. Progress is summarised at the end.
            if u.Progress == nil ||
                (u.Progress is 0.0 or 1.0) ||
                (u.Phase is JobPhase.Queued or JobPhase.Completed or JobPhase.Failed or JobPhase.Canceled) {
                var label = "[$title] ${u.Phase}"
                if !string.IsNullOrEmpty(u.Message) {
                    label += " — ${u.Message}"
                }
                writer.WriteMessage(label)
            }
        }

        private func WriteSummary(
            writer IOutputWriter,
            requests IReadOnlyList[JobRequest],
            terminals IReadOnlyDictionary[string, JobUpdate]
        ) {
            let rows = List[IReadOnlyDictionary[string, object?]](requests.Count)
            var completed = 0
            var failed = 0
            var canceled = 0
            var missing = 0
            for req in requests {
                if !terminals.TryGetValue(req.Id, out var term) {
                    missing++
                    rows.Add(
                        Dictionary[string, object?]{
                            ["jobId"] = req.Id,
                            ["asin"] = req.Asin,
                            ["title"] = req.Title,
                            ["status"] = "Pending",
                            ["error"] = nil
                        }
                    )
                    continue
                }
                switch term.Phase {
                    case JobPhase.Completed {
                        completed++
                    }
                    case JobPhase.Failed {
                        failed++
                    }
                    case JobPhase.Canceled {
                        canceled++
                    }
                    default {
                        let _ = 0
                    }
                }
                rows.Add(
                    Dictionary[string, object?]{
                        ["jobId"] = req.Id,
                        ["asin"] = req.Asin,
                        ["title"] = req.Title,
                        ["status"] = term.Phase.ToString(),
                        ["error"] = if term.Phase == JobPhase.Failed {
                            term.Message
                        } else {
                            default(string?)
                        }
                    }
                )
            }
            if writer.Context.Format == OutputFormat.Json {
                writer.WriteResource(
                    SummaryResource,
                    Dictionary[string, object?]{
                        ["completed"] = completed,
                        ["failed"] = failed,
                        ["canceled"] = canceled,
                        ["pending"] = missing,
                        ["jobs"] = rows
                    }
                )
                return
            }
            writer.WriteCollection(
                SummaryResource,
                rows,
                []OutputColumn{
                    OutputColumn("asin", "ASIN"),
                    OutputColumn("title", "Title"),
                    OutputColumn("status", "Status"),
                    OutputColumn("error", "Error")
                }
            )
            if failed == 0 && canceled == 0 && missing == 0 {
                writer.WriteSuccess("Downloaded $completed item(s).")
            }
        }

        private async func ResolveRequestsAsync(
            positional[]string,
            fromQueue bool,
            allNew bool,
            limit int32,
            profileAlias string?,
            quality DownloadQuality?,
            exportToAax bool,
            exportToM4b bool,
            noDecrypt bool,
            outputDir string?,
            force bool,
            cancellationToken CancellationToken
        ) ResolvedRequests {
            if allNew {
                return ResolvedRequests(
                    await ResolveAllNewAsync(
                        limit,
                        profileAlias,
                        quality,
                        exportToAax,
                        exportToM4b,
                        noDecrypt,
                        outputDir,
                        cancellationToken
                    ).ConfigureAwait(false),
                    0
                )
            }
            if fromQueue {
                return ResolvedRequests(
                    await ResolveFromQueueAsync(
                        profileAlias,
                        quality,
                        exportToAax,
                        exportToM4b,
                        noDecrypt,
                        outputDir,
                        cancellationToken
                    ).ConfigureAwait(false),
                    0
                )
            }
            let inputs = ExpandStdin(positional)
                .Select((s string) -> s.Trim())
                .Where((s string) -> !string.IsNullOrEmpty(s))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray()
            let known = await LookupLibraryAsync(cancellationToken).ConfigureAwait(false)
            let list = List[JobRequest](inputs.Length)
            var skipped = 0
            for asin in inputs {
                known.TryGetValue(asin, out var item)
                // A title that is no longer in the library can only end in a license denial, so say so
                // up front rather than after a pointless round-trip to Audible. --force still tries,
                // since the local cache can lag a title that was just re-shared or re-purchased.
                if item != nil && !item.IsAvailable && !force {
                    let label = if string.IsNullOrEmpty(item.Title) {
                        asin
                    } else {
                        "$asin (${item.Title})"
                    }
                    CliEnvironment.Error.WriteLine(
                        "oahu-cli: $label is no longer in your library — it may have been returned, or shared " +
                            "access (Amazon Household / Family Library) withdrawn. Skipping; use --force to try anyway."
                    )
                    skipped++
                    continue
                }
                let title = if string.IsNullOrEmpty(item?.Title) {
                    asin
                } else {
                    item.Title
                }
                list.Add(
                    BuildRequest(asin, title, profileAlias, quality, exportToAax, exportToM4b, noDecrypt, outputDir)
                )
            }
            return ResolvedRequests(list, skipped)
        }

        /// Indexes the local library by ASIN, including unavailable titles. Returns an empty map if the
        /// library cannot be read: a lookup failure must never block an otherwise valid download.
        private async func LookupLibraryAsync(cancellationToken CancellationToken) IReadOnlyDictionary[
            string,
            LibraryItem
        ] {
            let byAsin = Dictionary[string, LibraryItem](StringComparer.OrdinalIgnoreCase)
            try {
                let library = CliServiceFactory.LibraryServiceFactory()
                let items = await library.ListAsync(LibraryFilter{AvailableOnly: false}, cancellationToken)
                    .ConfigureAwait(false)
                for item in items {
                    if !string.IsNullOrEmpty(item.Asin) {
                        byAsin.TryAdd(item.Asin, item)
                    }
                }
            } catch (Exception) when !cancellationToken.IsCancellationRequested { }
            return byAsin
        }

        private async func ResolveFromQueueAsync(
            profileAlias string?,
            quality DownloadQuality?,
            exportToAax bool,
            exportToM4b bool,
            noDecrypt bool,
            outputDir string?,
            cancellationToken CancellationToken
        ) IReadOnlyList[JobRequest] {
            let queuePath = QueueCommand.QueuePath()
            let svc = JsonFileQueueService(queuePath)
            let entries = await svc.ListAsync(cancellationToken).ConfigureAwait(false)
            let list = List[JobRequest](entries.Count)
            for e in entries {
                list.Add(
                    BuildRequest(
                        e.Asin,
                        if string.IsNullOrEmpty(e.Title) {
                            e.Asin
                        } else {
                            e.Title
                        },
                        profileAlias ?? e.ProfileAlias,
                        quality ?? e.Quality,
                        exportToAax,
                        exportToM4b,
                        noDecrypt,
                        outputDir
                    )
                )
            }
            return list
        }

        private async func ResolveAllNewAsync(
            limit int32,
            profileAlias string?,
            quality DownloadQuality?,
            exportToAax bool,
            exportToM4b bool,
            noDecrypt bool,
            outputDir string?,
            cancellationToken CancellationToken
        ) IReadOnlyList[JobRequest] {
            let library = CliServiceFactory.LibraryServiceFactory()
            let jobs = CliServiceFactory.JobServiceFactory()
            let items = await library.ListAsync(filter: nil, cancellationToken).ConfigureAwait(false)
            let seenAsins = HashSet[string](StringComparer.OrdinalIgnoreCase)
            await for rec in jobs.ReadHistoryAsync(cancellationToken).ConfigureAwait(false) {
                if rec.TerminalPhase == JobPhase.Completed {
                    seenAsins.Add(rec.Asin)
                }
            }
            let list = List[JobRequest]()
            for item in items {
                if seenAsins.Contains(item.Asin) {
                    continue
                }
                list.Add(
                    BuildRequest(
                        item.Asin,
                        if string.IsNullOrEmpty(item.Title) {
                            item.Asin
                        } else {
                            item.Title
                        },
                        profileAlias,
                        quality,
                        exportToAax,
                        exportToM4b,
                        noDecrypt,
                        outputDir
                    )
                )
                if list.Count >= limit {
                    break
                }
            }
            return list
        }

        private func BuildRequest(
            asin string,
            title string,
            profileAlias string?,
            quality DownloadQuality?,
            exportToAax bool,
            exportToM4b bool,
            noDecrypt bool,
            outputDir string?
        ) JobRequest -> JobRequest{
            Asin: asin,
            Title: title,
            ProfileAlias: profileAlias,
            Quality: quality ?? DownloadQuality.High,
            ExportToAax: exportToAax,
            ExportToM4b: exportToM4b,
            NoDecrypt: noDecrypt,
            OutputDir: outputDir
        }

        private func ExpandStdin(inputs[]string) sequence[string] {
            for input in inputs {
                if input == "-" {
                    // Read entire stdin synchronously up-front. We are inside a synchronous
                    // iterator, but stdin reads are bounded by the user's input — typically
                    // pasted ASIN lists — so this does not introduce noticeable latency.
                    while true {
                        var line string? = nil
                        try {
                            line = Console.In.ReadLine()
                        } catch (IOException) {
                            // Treat torn pipe as EOF.

                        }
                        if line == nil {
                            break
                        }
                        yield line
                    }
                } else {
                    yield input
                }
            }
        }
    }
}
