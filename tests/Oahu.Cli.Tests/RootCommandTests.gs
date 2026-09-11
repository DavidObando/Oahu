package Oahu.Cli.Tests

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.Commands
import System
import System.Collections.Generic
import System.IO
import System.Threading.Tasks
import Xunit

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
        // Redirect output through CliEnvironment so the test doesn't pollute stdout.
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
            Assert.Contains("TUI mode requires", sw.ToString())
        } finally {
            CliEnvironment.Error = prevErr
        }
    }

    private class NullLoggerFactoryImpl : ILoggerFactory {
        func AddProvider(provider ILoggerProvider) { }

        func CreateLogger(categoryName string) ILogger -> NullLogger.Instance

        func Dispose() { }
    }

    shared {
        private func NullFactory() ILoggerFactory -> NullLoggerFactoryImpl()
    }
}
