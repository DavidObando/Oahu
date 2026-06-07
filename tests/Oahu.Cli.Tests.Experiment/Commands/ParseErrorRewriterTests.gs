// G# port of Commands/ParseErrorRewriterTests.cs (PARTIAL).
//
// The NoErrors, UnknownSubcommand, and UnknownSubcommand_NoCloseMatch tests
// require RootCommandFactory.Create(() => new LoggerFactory()) which hits
// the known limitation: cannot upcast concrete class to interface in lambda
// returns (LoggerFactory → ILoggerFactory). They also need StringWriter → TextWriter.
//
// Only SuggestNearest_PicksClosestWithinThreshold is ported (static method with
// basic types). The IReadOnlyList<string> parameter is tested with a List[string].

package Oahu.Cli.Tests.Experiment.Commands

import System.Collections.Generic
import Oahu.Cli.Commands
import Xunit

type ParseErrorRewriterTests class {
    @Fact
    func SuggestNearest_Kitten_FindsExactMatch() {
        var candidates = List[string]()
        candidates.Add("kitchen")
        candidates.Add("kitten")
        candidates.Add("mitten")
        var result = ParseErrorRewriter.SuggestNearest("kitten", candidates)
        Assert.Equal("kitten", result)
    }

    @Fact
    func SuggestNearest_Docter_FindsDoctor() {
        var candidates = List[string]()
        candidates.Add("doctor")
        candidates.Add("queue")
        candidates.Add("config")
        var result = ParseErrorRewriter.SuggestNearest("docter", candidates)
        Assert.Equal("doctor", result)
    }

    @Fact
    func SuggestNearest_NoCloseMatch_ReturnsNull() {
        var candidates = List[string]()
        candidates.Add("doctor")
        candidates.Add("config")
        var result = ParseErrorRewriter.SuggestNearest("zzzzzzz", candidates)
        Assert.Null(result)
    }

    @Fact
    func HelpHint_HasExpectedValue() {
        Assert.Equal("Try 'oahu-cli --help' for more information.", ParseErrorRewriter.HelpHint)
    }
}
