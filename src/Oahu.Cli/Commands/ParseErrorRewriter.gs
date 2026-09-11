package Oahu.Cli.Commands

import Oahu.Cli.App.Errors
import System
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.IO
import System.Linq

/// Catches parse errors before `InvokeAsync` and emits the design-spec
/// formatting (per §4.2 / §10): a short error, a "Try …help" footer, and a
/// "Did you mean: <i>x</i>" suggestion for unknown subcommands when there is
/// a close match (Levenshtein ≤ 2 within the eligible command set).
class ParseErrorRewriter {
    shared {
        const HelpHint string = "Try 'oahu-cli --help' for more information."

        /// Inspects [`parseResult`](paramref); if there are errors writes them
        /// to [`error`](paramref) in the canonical format and returns the
        /// `2` usage exit code. Returns `null` when no rewriting is needed
        /// (caller should proceed to invoke).
        func RewriteIfNeeded(parseResult ParseResult, error TextWriter) int32? {
            if parseResult.Errors.Count == 0 {
                return nil
            }
            for err in parseResult.Errors {
                error.WriteLine("oahu-cli: ${err.Message}")
            }
            let suggestion string? = SuggestSubcommand(parseResult)
            if suggestion != nil {
                error.WriteLine()
                error.WriteLine("Did you mean: oahu-cli $suggestion?")
            }
            error.WriteLine()
            error.WriteLine(HelpHint)
            return ExitCodes.UsageError
        }

        /// Looks for the first unrecognised token at the root level and proposes a
        /// nearest-neighbour subcommand. Returns null if no plausible match.
        func SuggestSubcommand(parseResult ParseResult) string? {
            let unmatched = parseResult.UnmatchedTokens
            if unmatched.Count == 0 {
                return nil
            }
            let first = unmatched[0]
            if string.IsNullOrEmpty(first) || first.StartsWith('-') {
                return nil
            }
            let commands = parseResult
                .RootCommandResult
                .Command
                .Subcommands
                .SelectMany((c Command) -> []string{c.Name}.Concat(c.Aliases))
                .Where((n string) -> !string.IsNullOrEmpty(n))
                .Distinct(StringComparer.Ordinal)
                .ToList()
            return SuggestNearest(first, commands)
        }

        func SuggestNearest(input string, candidates IReadOnlyList[string], maxDistance int32 = 2) string? {
            if string.IsNullOrEmpty(input) || candidates.Count == 0 {
                return nil
            }
            var best string? = nil
            var bestDist = int32.MaxValue
            for c in candidates {
                let d = Levenshtein(input, c)
                if d < bestDist {
                    bestDist = d
                    best = c
                }
            }
            return if bestDist <= maxDistance {
                best
            } else {
                default(string?)
            }
        }

        private func Levenshtein(a string, b string) int32 {
            if a.Length == 0 {
                return b.Length
            }
            if b.Length == 0 {
                return a.Length
            }
            var prev = [b.Length + 1]int32
            var curr = [b.Length + 1]int32
            for var j = 0;
            j <= b.Length;
            j++ {
                prev[j] = j
            }
            for var i = 1;
            i <= a.Length;
            i++ {
                curr[0] = i
                for var j = 1;
                j <= b.Length;
                j++ {
                    let cost = if char.ToLowerInvariant(a[i - 1]) == char.ToLowerInvariant(b[j - 1]) {
                        0
                    } else {
                        1
                    }
                    curr[j] = Math.Min(Math.Min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost)
                }
                prev, curr = curr, prev
            }
            return prev[b.Length]
        }
    }
}
