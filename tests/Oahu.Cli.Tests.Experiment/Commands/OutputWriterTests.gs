// G# port of Commands/OutputWriterTests.cs (PARTIAL).
//
// Only the ResolveFormat test is ported. The remaining tests all require passing
// a StringWriter where a TextWriter parameter is expected, which hits the known
// limitation: cannot upcast concrete class to abstract base class. The Pretty
// test additionally depends on Spectre.Console.Testing.TestConsole.
//
// Workarounds used: none (dropped tests due to upcast limitation).

package Oahu.Cli.Tests.Experiment.Commands

import Oahu.Cli.Output
import Xunit

type OutputWriterTests class {
    @Fact
    func ResolveFormat_RespectsJsonAndPlain() {
        Assert.Equal(OutputFormat.Json, OutputContext.ResolveFormat(true, false, false))
        Assert.Equal(OutputFormat.Plain, OutputContext.ResolveFormat(false, true, false))
        Assert.Equal(OutputFormat.Pretty, OutputContext.ResolveFormat(false, false, false))
        Assert.Equal(OutputFormat.Plain, OutputContext.ResolveFormat(false, false, true))
        Assert.Equal(OutputFormat.Json, OutputContext.ResolveFormat(true, true, false))
    }
}
