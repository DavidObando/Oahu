package Oahu.Cli.Commands

import Oahu.Cli
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.App.Paths
import Oahu.Cli.App.Queue
import Oahu.Cli.Output
import System
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

/// `oahu-cli queue list|add|remove|clear`.
///
/// 4a only accepts ASIN for `add`; phase 4b extends `add` to accept titles
/// (resolved through the library cache). The on-disk file is shared with the GUI
/// per design §7.
class QueueCommand {
    shared {
        const SchemaResource string = "queue"

        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let cmd = Command("queue", "Inspect and modify the shared download queue.")
            cmd.Subcommands.Add(CreateList(resolveGlobals))
            cmd.Subcommands.Add(CreateAdd(resolveGlobals))
            cmd.Subcommands.Add(CreateRemove(resolveGlobals))
            cmd.Subcommands.Add(CreateClear(resolveGlobals))
            return cmd
        }

        func ToDictionary(entry QueueEntry) IReadOnlyDictionary[string, object?] -> Dictionary[string, object?]{
            ["asin"] = entry.Asin,
            ["title"] = entry.Title,
            ["quality"] = entry.Quality.ToString(),
            ["addedAt"] = entry.AddedAt,
            ["profileAlias"] = entry.ProfileAlias
        }

        private func CreateList(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let c = Command("list", "List queued items.")
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let svc = CliServiceFactory.QueueServiceFactory()
                    let items = await svc.ListAsync(ct).ConfigureAwait(false)
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    let rows = List[IReadOnlyDictionary[string, object?]](items.Count)
                    for e in items {
                        rows.Add(ToDictionary(e))
                    }
                    writer.WriteCollection(
                        SchemaResource,
                        rows,
                        []OutputColumn{
                            OutputColumn("asin", "ASIN"),
                            OutputColumn("title", "Title"),
                            OutputColumn("quality", "Quality"),
                            OutputColumn("addedAt", "Added")
                        }
                    )
                    return ExitCodes.Success
                }
            )
            return c
        }

        private func CreateAdd(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let asinArg = Argument[[]string]("asin"){
                Arity = ArgumentArity.ZeroOrMore,
                Description = "One or more ASINs (use '-' to read one ASIN per line from stdin). Omit to search by --title."
            }
            let titleOpt = Option[string?]("--title"){
                Description = "When ASINs are supplied: tag for the new entry. When no ASINs are supplied: case-insensitive substring search against the library; a single match is added."
            }
            let c = Command(
                "add",
                "Add one or more ASINs to the queue, or resolve a single title via the library cache."
            ){asinArg, titleOpt}
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let asins = parse.GetValue(asinArg) ?? Array.Empty[string]()
                    let title = parse.GetValue(titleOpt)
                    let svc = CliServiceFactory.QueueServiceFactory()
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    // Title-based add: no positionals, --title supplied → search the library.
                    if asins.Length == 0 {
                        if string.IsNullOrWhiteSpace(title) {
                            CliEnvironment.Error.WriteLine("oahu-cli: queue add requires an ASIN or --title.")
                            return ExitCodes.UsageError
                        }
                        if title.Length < 4 {
                            CliEnvironment.Error.WriteLine(
                                "oahu-cli: --title must be at least 4 characters when used as a search term."
                            )
                            return ExitCodes.UsageError
                        }
                        let library = CliServiceFactory.LibraryServiceFactory()
                        let items = await library.ListAsync(LibraryFilter{Search: title, AvailableOnly: true}, ct)
                            .ConfigureAwait(false)
                        let matches = List[LibraryItem]()
                        for i in items {
                            if (i.Title?.IndexOf(title, StringComparison.OrdinalIgnoreCase) ?? -1) >= 0 ||
                                (i.Subtitle?.IndexOf(title, StringComparison.OrdinalIgnoreCase) ?? -1) >= 0 {
                                matches.Add(i)
                            }
                        }
                        if matches.Count == 0 {
                            CliEnvironment.Error.WriteLine(
                                "oahu-cli: no library item matches title '$title'. Try `oahu-cli library sync` first."
                            )
                            return ExitCodes.UsageError
                        }
                        if matches.Count > 1 {
                            CliEnvironment.Error.WriteLine(
                                "oahu-cli: '$title' matched ${matches.Count} items. Disambiguate with --asin:"
                            )
                            for m in matches.Take(10) {
                                CliEnvironment.Error.WriteLine("  ${m.Asin}  ${m.Title}")
                            }
                            if matches.Count > 10 {
                                CliEnvironment.Error.WriteLine("  … and ${matches.Count - 10} more.")
                            }
                            return ExitCodes.UsageError
                        }
                        let only = matches[0]
                        let ok = await svc.AddAsync(QueueEntry{Asin: only.Asin, Title: only.Title}, ct).ConfigureAwait(
                            false
                        )
                        writer.WriteResource(
                            "queue-add-result",
                            Dictionary[string, object?]{
                                ["added"] = if ok {
                                    1
                                } else {
                                    0
                                },
                                ["skipped"] = if ok {
                                    0
                                } else {
                                    1
                                },
                                ["resolvedAsin"] = only.Asin,
                                ["resolvedTitle"] = only.Title
                            }
                        )
                        return ExitCodes.Success
                    }
                    var added = 0
                    var skipped = 0
                    for input in ExpandStdin(asins) {
                        let trimmed = input.Trim()
                        if string.IsNullOrEmpty(trimmed) {
                            continue
                        }
                        let entry = QueueEntry{Asin: trimmed, Title: title ?? trimmed}
                        if await svc.AddAsync(entry, ct).ConfigureAwait(false) {
                            added++
                        } else {
                            skipped++
                        }
                    }
                    writer.WriteResource(
                        "queue-add-result",
                        Dictionary[string, object?]{["added"] = added, ["skipped"] = skipped}
                    )
                    return ExitCodes.Success
                }
            )
            return c
        }

        private func CreateRemove(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let asinArg = Argument[[]string]("asin"){
                Arity = ArgumentArity.OneOrMore,
                Description = "One or more ASINs to remove."
            }
            let c = Command("remove", "Remove items from the queue."){asinArg}
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let asins = parse.GetValue(asinArg) ?? Array.Empty[string]()
                    let svc = CliServiceFactory.QueueServiceFactory()
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    if globals.DryRun {
                        let items = await svc.ListAsync(ct).ConfigureAwait(false)
                        let present = HashSet[string](StringComparer.OrdinalIgnoreCase)
                        for e in items {
                            present.Add(e.Asin)
                        }
                        var wouldRemove = 0
                        var wouldMiss = 0
                        for a in asins {
                            if present.Contains(a) {
                                wouldRemove++
                            } else {
                                wouldMiss++
                            }
                        }
                        writer.WriteResource(
                            "queue-remove-plan",
                            Dictionary[string, object?]{["wouldRemove"] = wouldRemove, ["wouldMiss"] = wouldMiss}
                        )
                        return ExitCodes.Success
                    }
                    var removed = 0
                    var missing = 0
                    for asin in asins {
                        if await svc.RemoveAsync(asin, ct).ConfigureAwait(false) {
                            removed++
                        } else {
                            missing++
                        }
                    }
                    writer.WriteResource(
                        "queue-remove-result",
                        Dictionary[string, object?]{["removed"] = removed, ["missing"] = missing}
                    )
                    return if missing > 0 && removed == 0 {
                        ExitCodes.GenericFailure
                    } else {
                        ExitCodes.Success
                    }
                }
            )
            return c
        }

        private func CreateClear(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let c = Command("clear", "Remove every item from the queue.")
            c.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let force = globals.Force
                    let svc = CliServiceFactory.QueueServiceFactory()
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    if globals.DryRun {
                        let items = await svc.ListAsync(ct).ConfigureAwait(false)
                        writer.WriteResource(
                            "queue-clear-plan",
                            Dictionary[string, object?]{["wouldRemove"] = items.Count}
                        )
                        return ExitCodes.Success
                    }
                    if !force && CliEnvironment.IsStdinTty && CliEnvironment.IsStdoutTty {
                        CliEnvironment.Out.Write("Clear the entire queue? [y/N] ")
                        let line = Console.ReadLine()
                        if !string.Equals(line?.Trim(), "y", StringComparison.OrdinalIgnoreCase) {
                            CliEnvironment.Error.WriteLine("Aborted.")
                            return ExitCodes.Success
                        }
                    }
                    await svc.ClearAsync(ct).ConfigureAwait(false)
                    writer.WriteSuccess("Queue cleared.")
                    return ExitCodes.Success
                }
            )
            return c
        }

        func QueuePath() string -> Path.Combine(CliPaths.SharedUserDataDir, "queue.json")

        private func ExpandStdin(inputs[]string) sequence[string] {
            for input in inputs {
                if input == "-" {
                    var line string?
                    while (line = Console.In.ReadLine()) != nil {
                        yield line!!
                    }
                } else {
                    yield input
                }
            }
        }
    }
}
