// G# port of Commands/ParseErrorRewriterTests.cs.
// All 4 @Fact + 1 @Theory (with 3 InlineData) tests recovered.

package Oahu.Cli.Tests.Experiment.Commands

import System.CommandLine
import System.Collections.Generic
import System.IO
import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli.Commands
import Xunit

type ParseErrorRewriterTests class {
    func BuildRoot() RootCommand {
        return RootCommandFactory.Create(func() ILoggerFactory { return NullLoggerFactory.Instance })
    }

    @Fact
    func NoErrors_ReturnsNull() {
        let root = BuildRoot()
        let pr = root.Parse([]string{"doctor", "--skip-network", "--json"})
        let sw = StringWriter()
        Assert.Null(ParseErrorRewriter.RewriteIfNeeded(pr, sw))
        Assert.Empty(sw.ToString())
    }

    @Fact
    func UnknownSubcommand_AppendsHelpHintAndSuggestion() {
        let root = BuildRoot()
        let pr = root.Parse([]string{"doctorr"})
        let sw = StringWriter()
        let code = ParseErrorRewriter.RewriteIfNeeded(pr, sw)
        Assert.Equal(2, code!!)
        let output = sw.ToString()
        Assert.Contains("Did you mean: oahu-cli doctor", output)
        Assert.Contains(ParseErrorRewriter.HelpHint, output)
    }

    @Fact
    func UnknownSubcommand_NoCloseMatch_OmitsSuggestion() {
        let root = BuildRoot()
        let pr = root.Parse([]string{"xyzzy"})
        let sw = StringWriter()
        let code = ParseErrorRewriter.RewriteIfNeeded(pr, sw)
        Assert.Equal(2, code!!)
        Assert.DoesNotContain("Did you mean", sw.ToString())
        Assert.Contains(ParseErrorRewriter.HelpHint, sw.ToString())
    }

    @Theory
    @InlineData("kitten", []string{"kitchen", "kitten", "mitten"}, "kitten")
    @InlineData("docter", []string{"doctor", "queue", "config"}, "doctor")
    @InlineData("zzzzzzz", []string{"doctor", "config"}, nil)
    func SuggestNearest_PicksClosestWithinThreshold(input string, candidates []string, expected string?) {
        let list = List[string]()
        for c in candidates {
            list.Add(c)
        }
        Assert.Equal(expected, ParseErrorRewriter.SuggestNearest(input, list))
    }
}
