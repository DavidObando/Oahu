package Oahu.Cli.Commands

import Oahu.Cli
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Output
import System
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.Linq
import System.Threading
import System.Threading.Tasks

/// `oahu-cli library list | sync | show`.
///
/// 4b.1 ships the command surface against (cref:ILibraryService). The default
/// resolver returns a (cref:FakeLibraryService) seeded only by tests, so
/// on a clean machine `library list` prints an empty table until 4b.2
/// substitutes the Core-backed service that reads the GUI-shared library cache.
class LibraryCommand {
    shared {
        const ListSchemaResource string = "library-list"
        const ShowSchemaResource string = "library-show"

        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let cmd = Command("library", "Browse the cached Audible library.")
            cmd.Subcommands.Add(CreateList(resolveGlobals))
            cmd.Subcommands.Add(CreateSync(resolveGlobals))
            cmd.Subcommands.Add(CreateShow(resolveGlobals))
            return cmd
        }

        func ToDictionary(item LibraryItem) IReadOnlyDictionary[string, object?] -> Dictionary[string, object?]{
            ["asin"] = item.Asin,
            ["title"] = item.Title,
            ["subtitle"] = item.Subtitle,
            ["authors"] = item.Authors,
            ["narrators"] = item.Narrators,
            ["series"] = item.Series,
            ["seriesPosition"] = item.SeriesPosition,
            ["runtimeMinutes"] = if item.Runtime is {} rt {
                int32?(Math.Round(rt.TotalMinutes))
            } else {
                nil
            },
            ["purchaseDate"] = item.PurchaseDate,
            ["isAvailable"] = item.IsAvailable,
            ["hasMultiplePartFiles"] = item.HasMultiplePartFiles
        }

        private func CreateList(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let filterOpt = Option[string?]("--filter"){Description = "Substring match against title."}
            let authorOpt = Option[string?]("--author"){Description = "Substring match against any author."}
            let seriesOpt = Option[string?]("--series"){Description = "Exact match against the series name."}
            let unreadOpt = Option[bool]("--unread"){
                Description = "Restrict to titles with no successful download in history.jsonl."
            }
            let limitOpt = Option[int32?]("--limit"){Description = "Cap the number of results."}
            let allOpt = Option[bool]("--all"){Description = "Include unavailable titles (defaults to available-only)."}
            let c = Command("list", "List the cached library."){
                filterOpt,
                authorOpt,
                seriesOpt,
                unreadOpt,
                limitOpt,
                allOpt
            }
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    if parse.GetValue(unreadOpt) {
                        // "Unread" in v1 = ASIN has no Completed record in history.jsonl
                        // (any profile). LibraryItem has no listened/finished signal,
                        // so absence-of-download is the only deterministic test.
                        let jobs = CliServiceFactory.JobServiceFactory()
                        let seen = HashSet[string](StringComparer.OrdinalIgnoreCase)
                        await for rec in jobs.ReadHistoryAsync(ct).ConfigureAwait(false) {
                            if rec.TerminalPhase == JobPhase.Completed {
                                seen.Add(rec.Asin)
                            }
                        }
                        let svc2 = CliServiceFactory.LibraryServiceFactory()
                        let filter2 = LibraryFilter{
                            Search: parse.GetValue(filterOpt),
                            Author: parse.GetValue(authorOpt),
                            Series: parse.GetValue(seriesOpt),
                            AvailableOnly: !parse.GetValue(allOpt)
                        }
                        var unread = (await svc2.ListAsync(filter2, ct).ConfigureAwait(false)).Where(
                            (i LibraryItem) -> !seen.Contains(i.Asin)
                        )
                        let limit2 = parse.GetValue(limitOpt)
                        if limit2 is {} n2 && n2 > 0 {
                            unread = unread.Take(n2)
                        }
                        let unreadRows = unread.Select((i LibraryItem) -> ToDictionary(i)).ToList()
                        writer.WriteCollection(
                            ListSchemaResource,
                            unreadRows,
                            []OutputColumn{
                                OutputColumn("asin", "ASIN"),
                                OutputColumn("title", "Title"),
                                OutputColumn("authors", "Authors"),
                                OutputColumn("series", "Series"),
                                OutputColumn("runtimeMinutes", "Runtime (min)"),
                                OutputColumn("isAvailable", "Available")
                            }
                        )
                        return ExitCodes.Success
                    }
                    let filter = LibraryFilter{
                        Search: parse.GetValue(filterOpt),
                        Author: parse.GetValue(authorOpt),
                        Series: parse.GetValue(seriesOpt),
                        AvailableOnly: !parse.GetValue(allOpt)
                    }
                    let svc = CliServiceFactory.LibraryServiceFactory()
                    var items IEnumerable[LibraryItem] = await svc.ListAsync(filter, ct).ConfigureAwait(false)
                    let limit = parse.GetValue(limitOpt)
                    if limit is {} n && n > 0 {
                        items = items.Take(n)
                    }
                    let rows = items.Select((i LibraryItem) -> ToDictionary(i)).ToList()
                    writer.WriteCollection(
                        ListSchemaResource,
                        rows,
                        []OutputColumn{
                            OutputColumn("asin", "ASIN"),
                            OutputColumn("title", "Title"),
                            OutputColumn("authors", "Authors"),
                            OutputColumn("series", "Series"),
                            OutputColumn("runtimeMinutes", "Runtime (min)"),
                            OutputColumn("isAvailable", "Available")
                        }
                    )
                    return ExitCodes.Success
                }
            )
            return c
        }

        private func CreateSync(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let profileOpt = Option[string?]("--profile"){
                Description = "Profile alias whose library to sync (defaults to the active profile)."
            }
            let fullOpt = Option[bool]("--full"){
                Description = "Force a full re-sync rather than an incremental refresh."
            }
            let c = Command("sync", "Pull the latest library snapshot from Audible."){profileOpt, fullOpt}
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    var alias = parse.GetValue(profileOpt)
                    if string.IsNullOrWhiteSpace(alias) {
                        let auth = CliServiceFactory.AuthServiceFactory()
                        let active AuthSession? = await auth.GetActiveAsync(ct).ConfigureAwait(false)
                        if active == nil {
                            CliEnvironment.Error.WriteLine(
                                "No active profile. Sign in with `oahu-cli auth login` first, or pass --profile."
                            )
                            return ExitCodes.AuthError
                        }
                        alias = active.ProfileAlias
                    }
                    try {
                        let svc = CliServiceFactory.LibraryServiceFactory()
                        let count = await svc.SyncAsync(alias, ct).ConfigureAwait(false)
                        writer.WriteResource(
                            "library-sync-result",
                            Dictionary[string, object?]{
                                ["profileAlias"] = alias,
                                ["itemCount"] = count,
                                ["full"] = parse.GetValue(fullOpt)
                            }
                        )
                        return ExitCodes.Success
                    } catch (ex Exception) {
                        CliEnvironment.Error.WriteLine("Sync failed: ${ex.Message}")
                        return ExitCodes.AudibleApiError
                    }
                }
            )
            return c
        }

        private func CreateShow(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let asinArg = Argument[string]("asin"){Description = "Book ASIN."}
            let c = Command("show", "Show a single book's details."){asinArg}
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    let asin = parse.GetValue(asinArg)
                    let svc = CliServiceFactory.LibraryServiceFactory()
                    let item LibraryItem? = await svc.GetAsync(asin!!, ct).ConfigureAwait(false)
                    if item == nil {
                        CliEnvironment.Error.WriteLine(
                            "No library entry with ASIN '$asin'. Run `oahu-cli library sync` if you haven't recently."
                        )
                        return ExitCodes.GenericFailure
                    }
                    writer.WriteResource(ShowSchemaResource, ToDictionary(item))
                    return ExitCodes.Success
                }
            )
            return c
        }
    }
}
