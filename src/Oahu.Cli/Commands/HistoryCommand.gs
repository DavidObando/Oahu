package Oahu.Cli.Commands

import Oahu.Cli
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.App.Paths
import Oahu.Cli.Output
import System
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

/// `oahu-cli history list|show`. `retry` is wired in phase 4c when the
/// real job executor lands.
class HistoryCommand {
    shared {
        const SchemaResource string = "history"

        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let cmd = Command("history", "Inspect completed job history.")
            cmd.Subcommands.Add(CreateList(resolveGlobals))
            cmd.Subcommands.Add(CreateShow(resolveGlobals))
            cmd.Subcommands.Add(CreateRetry(resolveGlobals))
            cmd.Subcommands.Add(CreateDelete(resolveGlobals))
            return cmd
        }

        private func CreateDelete(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let keepOpt = Option[int32?]("--keep"){
                Description = "Keep at most N most-recent records overall (applied last)."
            }
            let beforeOpt = Option[string?]("--before"){
                Description = "Delete records completed before this date (yyyy-MM-dd or ISO 8601)."
            }
            let asinOpt = Option[[]string]("--asin"){
                Description = "Delete records for one or more ASINs.",
                Arity = ArgumentArity.ZeroOrMore
            }
            let c = Command("delete", "Delete records from the history file."){keepOpt, beforeOpt, asinOpt}
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let keep = parse.GetValue(keepOpt)
                    let beforeRaw = parse.GetValue(beforeOpt)
                    let asins = parse.GetValue(asinOpt) ?? Array.Empty[string]()
                    var before DateTimeOffset? = nil
                    if !string.IsNullOrEmpty(beforeRaw) {
                        if !DateTimeOffset.TryParse(beforeRaw, out var parsed) {
                            CliEnvironment.Error.WriteLine("oahu-cli: --before '$beforeRaw' is not a valid date.")
                            return ExitCodes.UsageError
                        }
                        before = parsed
                    }
                    if keep == nil && before == nil && asins.Length == 0 {
                        CliEnvironment.Error.WriteLine(
                            "oahu-cli: history delete requires at least one of --keep, --before, --asin."
                        )
                        return ExitCodes.UsageError
                    }
                    if keep is {} k && k < 0 {
                        CliEnvironment.Error.WriteLine("oahu-cli: --keep must be >= 0.")
                        return ExitCodes.UsageError
                    }
                    let historyPath = Path.Combine(CliPaths.SharedUserDataDir, "history.jsonl")
                    let store = JsonlHistoryStore(historyPath)
                    if globals.DryRun {
                        var wouldDelete = 0
                        await for rec in store.ReadAllAsync(ct).ConfigureAwait(false) {
                            let matchesAsin = asins.Length > 0 && asins.Any(
                                (a string) -> string.Equals(a, rec.Asin, StringComparison.OrdinalIgnoreCase)
                            )
                            let matchesBefore = before is {} b && rec.CompletedAt < b
                            if matchesAsin || matchesBefore {
                                wouldDelete++
                            }
                        }
                        let dryWriter = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                        dryWriter.WriteResource(
                            "history-delete-result",
                            Dictionary[string, object?]{
                                ["deleted"] = 0,
                                ["wouldDelete"] = wouldDelete,
                                ["dryRun"] = true
                            }
                        )
                        return ExitCodes.Success
                    }
                    let deleted = await store.DeleteAsync(asins, before, keep, ct).ConfigureAwait(false)
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    writer.WriteResource("history-delete-result", Dictionary[string, object?]{["deleted"] = deleted})
                    return ExitCodes.Success
                }
            )
            return c
        }

        func ToDictionary(record JobRecord) IReadOnlyDictionary[string, object?] -> Dictionary[string, object?]{
            ["id"] = record.Id,
            ["asin"] = record.Asin,
            ["title"] = record.Title,
            ["status"] = record.TerminalPhase.ToString(),
            ["startedAt"] = record.StartedAt,
            ["completedAt"] = record.CompletedAt,
            ["errorMessage"] = record.ErrorMessage,
            ["profileAlias"] = record.ProfileAlias,
            ["quality"] = record.Quality?.ToString()
        }

        private func CreateList(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let sinceOpt = Option[string?]("--since"){
                Description = "Filter to records on or after this date (yyyy-MM-dd or ISO 8601 timestamp)."
            }
            let statusOpt = Option[string?]("--status"){
                Description = "Filter by status: completed|failed|canceled|all (default: all)."
            }
            let limitOpt = Option[int32?]("--limit"){
                Description = "Limit the number of records returned (most recent first when set)."
            }
            let c = Command("list", "List terminal job records."){sinceOpt, statusOpt, limitOpt}
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    var since DateTimeOffset? = nil
                    let sinceRaw = parse.GetValue(sinceOpt)
                    if !string.IsNullOrEmpty(sinceRaw) {
                        if !DateTimeOffset.TryParse(sinceRaw, out var parsed) {
                            CliEnvironment.Error.WriteLine("oahu-cli: --since '$sinceRaw' is not a valid date.")
                            return ExitCodes.UsageError
                        }
                        since = parsed
                    }
                    let status = parse.GetValue(statusOpt)
                    let limit = parse.GetValue(limitOpt)
                    let store = JsonlHistoryStore(HistoryPath())
                    var records = List[JobRecord]()
                    await for rec in store.ReadAllAsync(ct).ConfigureAwait(false) {
                        if since != nil && rec.CompletedAt < since {
                            continue
                        }
                        if !StatusMatches(rec.TerminalPhase, status) {
                            continue
                        }
                        records.Add(rec)
                    }
                    if limit is int32 n && n > 0 && records.Count > n {
                        records = records
                            .OrderByDescending((r JobRecord) -> r.CompletedAt)
                            .Take(n)
                            .OrderBy((r JobRecord) -> r.CompletedAt)
                            .ToList()
                    }
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    let rows = records.Select(ToDictionary).ToList()
                    writer.WriteCollection(
                        SchemaResource,
                        rows,
                        []OutputColumn{
                            OutputColumn("id", "Id"),
                            OutputColumn("asin", "ASIN"),
                            OutputColumn("title", "Title"),
                            OutputColumn("status", "Status"),
                            OutputColumn("completedAt", "Completed")
                        }
                    )
                    return ExitCodes.Success
                }
            )
            return c
        }

        private func CreateShow(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let idArg = Argument[string]("jobId"){Description = "Job id to show."}
            let c = Command("show", "Show a single history record by id."){idArg}
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let id = parse.GetValue(idArg)!!
                    let store = JsonlHistoryStore(HistoryPath())
                    var hit JobRecord? = nil
                    await for rec in store.ReadAllAsync(ct).ConfigureAwait(false) {
                        if string.Equals(rec.Id, id, StringComparison.OrdinalIgnoreCase) {
                            hit = rec
                            break
                        }
                    }
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    if hit == nil {
                        CliEnvironment.Error.WriteLine("oahu-cli: no history record with id '$id'.")
                        return ExitCodes.GenericFailure
                    }
                    writer.WriteResource("history-record", ToDictionary(hit))
                    return ExitCodes.Success
                }
            )
            return c
        }

        func HistoryPath() string -> Path.Combine(CliPaths.SharedUserDataDir, "history.jsonl")

        private func CreateRetry(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let idArg = Argument[string]("jobId"){Description = "Id of a past job to resubmit."}
            let c = Command(
                "retry",
                "Resubmit a past job as a brand-new download. Reuses the recorded ASIN, title, and quality (if known); a fresh job id is assigned."
            ){idArg}
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let id = parse.GetValue(idArg)!!
                    let store = JsonlHistoryStore(HistoryPath())
                    var hit JobRecord? = nil
                    await for rec in store.ReadAllAsync(ct).ConfigureAwait(false) {
                        if string.Equals(rec.Id, id, StringComparison.OrdinalIgnoreCase) {
                            hit = rec
                            break
                        }
                    }
                    if hit == nil {
                        CliEnvironment.Error.WriteLine("oahu-cli: no history record with id '$id'.")
                        return ExitCodes.GenericFailure
                    }
                    let request = JobRequest{
                        Asin: hit.Asin,
                        Title: hit.Title,
                        ProfileAlias: hit.ProfileAlias,
                        Quality: hit.Quality ?? DownloadQuality.High
                    }
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    let jobService = CliServiceFactory.JobServiceFactory()
                    return await DownloadCommand.RunAsync(jobService, []JobRequest{request}, writer, ct).ConfigureAwait(
                        false
                    )
                }
            )
            return c
        }

        private func StatusMatches(phase JobPhase, wanted string?) bool {
            if string.IsNullOrEmpty(wanted) || wanted!!.Equals("all", StringComparison.OrdinalIgnoreCase) {
                return true
            }
            return switch wanted!!.ToLowerInvariant() {
                case "completed": phase == JobPhase.Completed
                case "failed": phase == JobPhase.Failed
                case "canceled" or "cancelled": phase == JobPhase.Canceled
                default: false
            }
        }
    }
}
