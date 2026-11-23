package Oahu.Cli.Tests

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Spectre.Console.Testing
import System
import System.Collections.Generic
import System.IO
import System.Threading
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
    async func Tui_Launcher_Wires_The_Scheduler_For_CtrlC_Cancellation() {
        await using let scheduler = JobScheduler(FakeJobExecutor(delayPerPhase: TimeSpan.FromMinutes(1)))
        await scheduler.SubmitAsync(JobRequest{Asin: "active", Title: "Active"})
        let stdin = typeof(CliEnvironment).GetProperty("IsStdinTty")!!
        let stdout = typeof(CliEnvironment).GetProperty("IsStdoutTty")!!
        let previousStdin = stdin.GetValue(nil)
        let previousStdout = stdout.GetValue(nil)
        let previousTerm = Environment.GetEnvironmentVariable("TERM")
        let previousNoTui = Environment.GetEnvironmentVariable("OAHU_NO_TUI")
        let previousLauncher = TuiCommand.Launcher
        let previousTheme = Theme.Current.Name
        let directory = Path.Combine(Path.GetTempPath(), "oahu-tui-launcher-" + Guid.NewGuid().ToString("N"))
        Directory.CreateDirectory(directory)
        CliServiceFactory.Reset()
        try {
            stdin.SetValue(nil, true)
            stdout.SetValue(nil, true)
            Environment.SetEnvironmentVariable("TERM", "xterm-256color")
            Environment.SetEnvironmentVariable("OAHU_NO_TUI", nil)
            CliServiceFactory.AuthServiceFactory = () -> FakeAuthService()
            CliServiceFactory.LibraryServiceFactory = () -> FakeLibraryService(Array.Empty[LibraryItem]())
            CliServiceFactory.ConfigServiceFactory = () -> JsonConfigService(Path.Combine(directory, "config.json"))
            CliServiceFactory.JobServiceFactory = () -> scheduler
            var launched = false
            TuiCommand.Launcher = (options AppShellOptions) -> {
                launched = true
                Assert.NotNull(options.JobServiceFactory)
                Assert.Same(scheduler, options.JobServiceFactory!!())
                let console = TestConsole()
                console.Profile.Width = 120
                console.Profile.Height = 30
                let shell = AppShell(console, options)
                Assert.Equal(ShellAction.Continue, shell.Dispatch(ConsoleKeyInfo(char(3), ConsoleKey.C, false, false, true)))
                return 0
            }
            Assert.Equal(0, TuiCommand.Run())
            Assert.True(launched)
            using let timeout = CancellationTokenSource(TimeSpan.FromSeconds(5))
            while scheduler.ListActive().Count > 0 {
                await Task.Delay(10, timeout.Token)
            }
            Assert.Empty(scheduler.ListActive())
        } finally {
            TuiCommand.Launcher = previousLauncher
            stdin.SetValue(nil, previousStdin)
            stdout.SetValue(nil, previousStdout)
            Environment.SetEnvironmentVariable("TERM", previousTerm)
            Environment.SetEnvironmentVariable("OAHU_NO_TUI", previousNoTui)
            Theme.Use(previousTheme)
            CliServiceFactory.Reset()
            Directory.Delete(directory, recursive: true)
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
