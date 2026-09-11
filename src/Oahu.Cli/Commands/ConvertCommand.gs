package Oahu.Cli.Commands

import Oahu.Cli
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Models
import Oahu.Cli.Output
import System
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

/// `oahu-cli convert <asin>...`.
///
/// Convenience alias around (cref:DownloadCommand) that always sets
/// (cref:JobRequest.ExportToAax). The underlying
/// (cref:Oahu.Core.DownloadDecryptJob{T}) short-circuits download/decrypt
/// when the local file already exists, so re-invoking `convert` on a
/// previously-downloaded book just runs the AAX export step. If the book has
/// not been downloaded, `convert` downloads + decrypts + exports.
///
/// Accepts ASINs as positional args. As a convenience, if a positional arg is
/// a path to a local `.aax` / `.aaxc` file whose name matches the
/// Audible naming convention `<ASIN>_xxx.aax[c]`, the ASIN is
/// inferred from the filename and the file is converted in-place. Other
/// file-based convert flows are not supported because (cref:Oahu.Core.AaxExporter)
/// requires per-book license metadata that is keyed by ASIN.
class ConvertCommand {
    shared {
        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let asinArg = Argument[[]string]("asin"){
                Arity = ArgumentArity.ZeroOrMore,
                Description = "One or more ASINs (or paths to <ASIN>_xxx.aax files). Use '-' to read one ASIN per line from stdin."
            }
            let outputDirOpt = Option[string?]("--output-dir"){Description = "Override the export directory."}
            let profileOpt = Option[string?]("--profile"){
                Description = "Profile alias to use (defaults to the active profile)."
            }
            let concurrencyOpt = Option[int32?]("--concurrency"){
                Description = "Maximum parallel jobs (default: 1). Must be >= 1."
            }
            let cmd = Command(
                "convert",
                "Export one or more audiobooks to AAX. Downloads and decrypts first if needed."
            ){asinArg, outputDirOpt, profileOpt, concurrencyOpt}
            cmd.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let asins = parse.GetValue(asinArg) ?? Array.Empty[string]()
                    let outputDir = parse.GetValue(outputDirOpt)
                    let profile = parse.GetValue(profileOpt)
                    let concurrency = parse.GetValue(concurrencyOpt)
                    if concurrency is {} cVal && cVal < 1 {
                        CliEnvironment.Error.WriteLine("oahu-cli: --concurrency must be >= 1.")
                        return ExitCodes.UsageError
                    }
                    let distinct = asins
                        .Select((s string) -> s.Trim())
                        .Where((s string) -> !string.IsNullOrEmpty(s))
                        .Select(TryResolveAsinFromPath)
                        .Where((s(Input string, Resolved string?)) -> s.Resolved != nil)
                        .Select((s(Input string, Resolved string?)) -> s.Resolved!!)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToArray()
                    // Surface any inputs we couldn't resolve to an ASIN so the user
                    // gets a concrete error rather than silent dropping.
                    let unresolved = asins
                        .Select((s string) -> s.Trim())
                        .Where((s string) -> !string.IsNullOrEmpty(s))
                        .Where((s string) -> TryResolveAsinFromPath(s).Resolved == nil)
                        .ToArray()
                    if unresolved.Length > 0 {
                        CliEnvironment.Error.WriteLine(
                            "oahu-cli: could not infer ASIN from: ${string.Join(", ", unresolved)}. " +
                                "Pass an ASIN, or a file named '<ASIN>_xxx.aax[c]'."
                        )
                        return ExitCodes.UsageError
                    }
                    if distinct.Length == 0 {
                        CliEnvironment.Error.WriteLine("oahu-cli: no ASINs supplied.")
                        return ExitCodes.UsageError
                    }
                    let requests = distinct.Select(
                        (a string) -> JobRequest{
                            Asin: a,
                            Title: a,
                            ProfileAlias: profile,
                            Quality: DownloadQuality.High,
                            ExportToAax: true,
                            OutputDir: outputDir
                        }
                    )
                        .ToList()
                    let writer = OutputWriterFactory.Create(ConfigCommand.BuildContext(globals))
                    if globals.DryRun {
                        DownloadCommand.EmitDryRunPlan(writer, requests)
                        return ExitCodes.Success
                    }
                    if concurrency is {} cParallelism {
                        CliServiceFactory.OverrideMaxParallelism = cParallelism
                    }
                    let jobService = CliServiceFactory.JobServiceFactory()
                    return await DownloadCommand.RunAsync(jobService, requests, writer, ct).ConfigureAwait(false)
                }
            )
            return cmd
        }

        /// Maps a positional input — either an ASIN or a path to an Audible
        /// `<ASIN>_xxx.aax[c]` file — to the underlying ASIN. We treat
        /// the input as a path only if it contains a directory separator or ends
        /// with an Audible file extension; otherwise we accept it as an ASIN
        /// verbatim and let the executor reject any unknown ASIN.
        /// Returns `(input, null)` when neither form yields an ASIN.
        internal func TryResolveAsinFromPath(raw string)(Input string, Resolved string?) {
            let looksLikePath = raw.IndexOfAny([]char{'/', '\\'}) >= 0 || raw.EndsWith(
                ".aax",
                StringComparison.OrdinalIgnoreCase
            ) ||
                raw.EndsWith(".aaxc", StringComparison.OrdinalIgnoreCase)
            if !looksLikePath {
                return (raw, raw)
            }
            try {
                let fileName = Path.GetFileName(raw)
                if !string.IsNullOrEmpty(fileName) {
                    let underscore = fileName.IndexOf('_')
                    if underscore > 0 {
                        let candidate = fileName.Substring(0, underscore)
                        if LooksLikeAsin(candidate) {
                            return (raw, candidate.ToUpperInvariant())
                        }
                    }
                }
            } catch (ArgumentException) {
                // GetFileName throws on invalid path chars; treat as unresolved.

            }
            return (raw, nil)
        }

        private func LooksLikeAsin(s string) bool {
            if !(s != nil && s.Length == 10) {
                return false
            }
            for c in s {
                if !char.IsLetterOrDigit(c) {
                    return false
                }
            }
            return true
        }
    }
}
