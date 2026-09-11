package Oahu.Cli.Tests.Commands

import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import Oahu.Cli.Tests.Tui
import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks
import Xunit

/// End-to-end command-mode integration: drives (cref:RootCommandFactory)
/// against a seeded fake service container and asserts both exit code and the
/// JSON document shape the command emits to stdout.
@Collection("EnvVarSerial")
class AuthLibraryEndToEndTests : IDisposable {
    init() {
        CliServiceFactory.Reset()
    }

    func Dispose() {
        CliServiceFactory.AuthServiceFactory = () -> FakeAuthService()
        CliServiceFactory.LibraryServiceFactory = () -> FakeLibraryService()
        CliServiceFactory.Reset()
    }

    @Fact
    async func AuthStatus_NoProfiles_ExitsThree() {
        let (exit, _, _) = await RunAsync("auth", "status", "--json")
        Assert.Equal(3, exit)
    }

    @Fact
    async func AuthStatus_ListsSessionsAsJson() {
        let auth = FakeAuthService()
        await auth.LoginAsync(CliRegion.De, NonInteractiveCallbackBroker())
        CliServiceFactory.AuthServiceFactory = () -> auth
        let (exit, stdout, _) = await RunAsync("auth", "status", "--json")
        Assert.Equal(0, exit)
        Assert.Contains("\"region\": \"de\"", stdout)
        Assert.Contains("\"isActive\": true", stdout)
        Assert.Contains("\"resource\": \"auth-status\"", stdout)
    }

    @Fact
    async func LibraryList_FiltersBySearch() {
        let lib = FakeLibraryService(
            []LibraryItem{LibraryItem{Asin: "A1", Title: "Project Hail Mary"}, LibraryItem{Asin: "A2", Title: "Dune"}}
        )
        CliServiceFactory.LibraryServiceFactory = () -> lib
        let (exit, stdout, _) = await RunAsync("library", "list", "--filter", "Hail", "--json")
        Assert.Equal(0, exit)
        Assert.Contains("\"count\": 1", stdout)
        Assert.Contains("\"asin\": \"A1\"", stdout)
        Assert.DoesNotContain("Dune", stdout)
    }

    @Fact
    async func LibraryShow_MissingAsin_ExitsOne() {
        let (exit, _, _) = await RunAsync("library", "show", "B0FAKE")
        Assert.Equal(1, exit)
    }

    @Fact
    async func LibraryShow_FoundAsin_EmitsJson() {
        let lib = FakeLibraryService([]LibraryItem{LibraryItem{Asin: "A1", Title: "Test", Authors: []string{"X"}}})
        CliServiceFactory.LibraryServiceFactory = () -> lib
        let (exit, stdout, _) = await RunAsync("library", "show", "A1", "--json")
        Assert.Equal(0, exit)
        Assert.Contains("\"resource\": \"library-show\"", stdout)
        Assert.Contains("\"asin\": \"A1\"", stdout)
    }

    @Fact
    async func LibraryUnread_FiltersByMissingHistory() {
        let lib = FakeLibraryService(
            []LibraryItem{
                LibraryItem{Asin: "AREAD", Title: "Read Book"},
                LibraryItem{Asin: "AUNREAD", Title: "Unread Book"}
            }
        )
        CliServiceFactory.LibraryServiceFactory = () -> lib
        let fakeJobs = FakeJobService()
        fakeJobs.SeedHistory(
            JobRecord{
                Id: "j1",
                Asin: "AREAD",
                Title: "Read Book",
                TerminalPhase: JobPhase.Completed,
                StartedAt: DateTimeOffset.UtcNow,
                CompletedAt: DateTimeOffset.UtcNow
            }
        )
        CliServiceFactory.JobServiceFactory = () -> fakeJobs
        let (exit, stdout, _) = await RunAsync("library", "list", "--unread", "--json")
        Assert.Equal(0, exit)
        Assert.Contains("AUNREAD", stdout)
        Assert.DoesNotContain("AREAD\"", stdout)
    }

    @Fact
    async func AuthLogin_PositionalRegionParses() {
        let auth = FakeAuthService()
        CliServiceFactory.AuthServiceFactory = () -> auth
        let (exit, _, _) = await RunAsync("auth", "login", "uk", "--browser", "--no-sync", "--json")
        Assert.Equal(0, exit)
        Assert.Single(await auth.ListSessionsAsync())
    }

    @Fact
    async func AuthLogin_CredentialsFlow_UsesUsernamePasswordAndSyncs() {
        let auth = RecordingFakeAuthService()
        let lib = FakeLibraryService([]LibraryItem{LibraryItem{Asin: "A1", Title: "After-login book"}})
        CliServiceFactory.AuthServiceFactory = () -> auth
        CliServiceFactory.LibraryServiceFactory = () -> lib
        let (exit, stdout, _) = await RunWithStdinAsync(
            stdin: "hunter2\n",
            "auth",
            "login",
            "uk",
            "--username",
            "user@example.com",
            "--password-stdin",
            "--json"
        )
        Assert.Equal(0, exit)
        Assert.Equal("user@example.com", auth.LastCredentials?.Username)
        Assert.Equal("hunter2", auth.LastCredentials?.Password)
        Assert.False(auth.BrowserLoginInvoked, "Default flow must not fall back to LoginAsync.")
        Assert.Contains("\"librarySynced\": true", stdout)
        Assert.Contains("\"libraryCount\": 1", stdout)
    }

    @Fact
    async func AuthLogin_BrowserFlag_UsesBrowserPath() {
        let auth = RecordingFakeAuthService()
        CliServiceFactory.AuthServiceFactory = () -> auth
        CliServiceFactory.LibraryServiceFactory = () -> FakeLibraryService()
        let (exit, _, _) = await RunAsync("auth", "login", "us", "--browser", "--no-sync", "--json")
        Assert.Equal(0, exit)
        Assert.True(auth.BrowserLoginInvoked)
        Assert.Null(auth.LastCredentials)
    }

    @Fact
    async func AuthLogin_NoStdinAndNoCreds_ExitsAuthError() {
        let auth = RecordingFakeAuthService()
        CliServiceFactory.AuthServiceFactory = () -> auth
        // Empty stdin: when CliEnvironment.IsStdinTty is true the prompt fires
        // and ReadLine returns null/empty → "Email is required"; when it's
        // false, ResolveCredentials throws NonInteractiveCallbackException
        // → "stdin is not a TTY". Either way the command must exit 3 and never
        // reach the auth service.
        let (exit, _, stderr) = await RunWithStdinAsync(stdin: string.Empty, "auth", "login", "us", "--json")
        Assert.Equal(3, exit)
        Assert.Null(auth.LastCredentials)
        Assert.False(auth.BrowserLoginInvoked)
        Assert.Contains("Sign-in", stderr)
    }

    private class RecordingFakeAuthService : IAuthService {
        private let inner FakeAuthService = FakeAuthService()

        prop LastCredentials AuthCredentials? {
            get;
            private set;
        }

        prop BrowserLoginInvoked bool {
            get;
            private set;
        }

        func ListSessionsAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[
            IReadOnlyList[AuthSession]
        ] -> inner.ListSessionsAsync(cancellationToken)

        func GetActiveAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[
            AuthSession?
        ] -> inner.GetActiveAsync(cancellationToken)

        func LoginAsync(
            region CliRegion,
            broker IAuthCallbackBroker,
            preAmazonUsername bool = false,
            cancellationToken CancellationToken = default(CancellationToken)
        ) Task[AuthSession] {
            BrowserLoginInvoked = true
            return inner.LoginAsync(region, broker, preAmazonUsername, cancellationToken)
        }

        func LoginWithCredentialsAsync(
            region CliRegion,
            broker IAuthCallbackBroker,
            credentials AuthCredentials,
            preAmazonUsername bool = false,
            cancellationToken CancellationToken = default(CancellationToken)
        ) Task[AuthSession] {
            LastCredentials = credentials
            return inner.LoginWithCredentialsAsync(region, broker, credentials, preAmazonUsername, cancellationToken)
        }

        func LogoutAsync(
            profileAlias string,
            cancellationToken CancellationToken = default(CancellationToken)
        ) Task -> inner.LogoutAsync(profileAlias, cancellationToken)

        func RefreshAsync(profileAlias string, cancellationToken CancellationToken = default(CancellationToken)) Task[
            AuthSession
        ] -> inner.RefreshAsync(profileAlias, cancellationToken)
    }

    shared {
        private func RunAsync(args ...string) Task[(exit int32, stdout string, stderr string)] -> RunWithStdinAsync(
            stdin: nil,
            args
        )

        private async func RunWithStdinAsync(stdin string?, args ...string)(exit int32, stdout string, stderr string) {
            let origOut = Console.Out
            let origErr = Console.Error
            let origIn = Console.In
            let origCliOut = CliEnvironment.Out
            let origCliErr = CliEnvironment.Error
            let sw = StringWriter()
            let ew = StringWriter()
            Console.SetOut(sw)
            Console.SetError(ew)
            if stdin != nil {
                Console.SetIn(StringReader(stdin))
            }
            CliEnvironment.Out = sw
            CliEnvironment.Error = ew
            try {
                let root = RootCommandFactory.Create(
                    func () ILoggerFactory {
                        return NullLoggerFactory.Instance
                    }
                )
                let parse = root.Parse(args)
                let exit = await parse.InvokeAsync()
                return (exit, sw.ToString(), ew.ToString())
            } finally {
                Console.SetOut(origOut)
                Console.SetError(origErr)
                Console.SetIn(origIn)
                CliEnvironment.Out = origCliOut
                CliEnvironment.Error = origCliErr
            }
        }
    }
}
