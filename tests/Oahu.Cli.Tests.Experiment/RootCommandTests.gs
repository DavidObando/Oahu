// G# port of RootCommandTests.cs.
//
// LIMITATIONS:
//   - Cannot declare type implementing CLR interface (GS0157) → NullLoggerFactory dropped.
//   - Cannot upcast concrete to interface (NullLoggerFactoryImpl → ILoggerFactory) → all
//     tests using RootCommandFactory.Create(Func<ILoggerFactory>) are dropped.
//
// Recovered (0.1.516): DoctorCommand async test via blocking InvokeAsync().GetAwaiter().GetResult()
// and NullLoggerFactory.Instance as the factory return.

package Oahu.Cli.Tests.Experiment

import System
import System.IO
import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.Commands
import Xunit

type RootCommandTests class {
    @Fact
    func DoctorCommand_RunsAndReturnsZeroOnHealthyEnv() {
        using let sw = StringWriter()
        CliEnvironment.Initialise()
        let prevOut = CliEnvironment.Out
        let prevErr = CliEnvironment.Error
        CliEnvironment.Out = sw
        CliEnvironment.Error = sw
        try {
            let root = RootCommandFactory.Create(func() ILoggerFactory { return NullLoggerFactory.Instance })
            let parse = root.Parse([]string{"doctor", "--skip-network", "--json"})
            let rc = parse.InvokeAsync().GetAwaiter().GetResult()
            Assert.Equal(0, rc)
            Assert.Contains("\"_schemaVersion\":1", sw.ToString())
        } finally {
            CliEnvironment.Out = prevOut
            CliEnvironment.Error = prevErr
        }
    }

    @Fact
    func Tui_ReturnsExitCode2WhenNotATty() {
        // The test runner does not provide a TTY, so CanEnterTui should be false.
        CliEnvironment.Initialise()
        var rc = TuiCommand.Run()
        Assert.Equal(2, rc)
    }
}
