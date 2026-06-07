// G# port of RootCommandTests.cs.
//
// LIMITATIONS:
//   - Cannot declare type implementing CLR interface (GS0157) → NullLoggerFactory dropped.
//   - Cannot upcast concrete to interface (NullLoggerFactoryImpl → ILoggerFactory) → all
//     tests using RootCommandFactory.Create(Func<ILoggerFactory>) are dropped.
//   - Async InvokeAsync + StringWriter→TextWriter upcast blocks DoctorCommand test.
//
// Ported: Tui_ReturnsExitCode2WhenNotATty (only uses static TuiCommand.Run()).

package Oahu.Cli.Tests.Experiment

import Oahu.Cli
import Oahu.Cli.Commands
import Xunit

type RootCommandTests class {
    @Fact
    func Tui_ReturnsExitCode2WhenNotATty() {
        // The test runner does not provide a TTY, so CanEnterTui should be false.
        CliEnvironment.Initialise()
        var rc = TuiCommand.Run()
        Assert.Equal(2, rc)
    }
}
