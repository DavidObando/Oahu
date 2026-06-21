// G# port of RootCommandTests.cs.
//
// LIMITATIONS:
//   - Cannot declare type implementing CLR interface (GS0157) → NullLoggerFactory dropped.
//   - Cannot upcast concrete to interface (NullLoggerFactoryImpl → ILoggerFactory) → all
//     tests using RootCommandFactory.Create(Func<ILoggerFactory>) are dropped.
//
// Recovered (0.1.516): DoctorCommand async test via blocking InvokeAsync().GetAwaiter().GetResult()
// and NullLoggerFactory.Instance as the factory return.

package Oahu.Cli.Tests

import System
import System.Collections.Generic
import System.IO
import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.Commands
import Xunit

private class NullLoggerFactoryImpl : ILoggerFactory {
    func AddProvider(provider ILoggerProvider) {
    }

    func CreateLogger(categoryName string) ILogger {
        return NullLogger.Instance
    }

    func Dispose() {
    }
}

func NullFactory() ILoggerFactory {
    return NullLoggerFactoryImpl()
}

@Collection("EnvVarSerial")
class RootCommandTests {
    @Fact
    func Create_RegistersDoctorAndTuiSubcommands() {
        let root = RootCommandFactory.Create(NullFactory)
        let names = List[string]()
        for c in root.Subcommands {
            names.Add(c.Name)
        }
        Assert.Contains("doctor", names)
        Assert.Contains("tui", names)
    }

    @Fact
    func Create_ExposesGlobalOptions() {
        let root = RootCommandFactory.Create(NullFactory)
        let names = List[string]()
        for o in root.Options {
            names.Add(o.Name)
        }
        Assert.Contains("--quiet", names)
        Assert.Contains("--verbose", names)
        Assert.Contains("--no-color", names)
        Assert.Contains("--config-dir", names)
        Assert.Contains("--log-dir", names)
        Assert.Contains("--log-level", names)
        Assert.Contains("--theme", names)
    }

    @Fact
    async func DoctorCommand_RunsAndReturnsZeroOnHealthyEnv() {
        using let sw = StringWriter()
        CliEnvironment.Initialise()
        let prevOut = CliEnvironment.Out
        let prevErr = CliEnvironment.Error
        CliEnvironment.Out = sw
        CliEnvironment.Error = sw
        try {
            let root = RootCommandFactory.Create(NullFactory)
            let rc = await root.Parse([]string{"doctor", "--skip-network", "--json"}).InvokeAsync()
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
        using let sw = StringWriter()
        let prevErr = CliEnvironment.Error
        CliEnvironment.Error = sw
        try {
            CliEnvironment.Initialise()
            let rc = TuiCommand.Run()
            Assert.Equal(2, rc)
        }
        finally {
            CliEnvironment.Error = prevErr
        }
    }
}
