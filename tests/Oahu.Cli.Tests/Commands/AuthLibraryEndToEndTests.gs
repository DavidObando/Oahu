// G# port of Commands/AuthLibraryEndToEndTests.cs.
// All 10 tests recovered: gsharp#641 fixed unblocks async-yield-on-iface-impl,
// so we can implement IJobService directly for LibraryUnread_FiltersByMissingHistory.

package Oahu.Cli.Tests.Commands

import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks
import Microsoft.Extensions.Logging
import Microsoft.Extensions.Logging.Abstractions
import Oahu.Cli
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Models
import Oahu.Cli.Commands
import Xunit

class E2EAuthCmdResult {
    prop Exit int32 { get; set; }
    prop Stdout string { get; set; }
    prop Stderr string { get; set; }

    init(exit int32, stdout string, stderr string) {
        Exit = exit
        Stdout = stdout
        Stderr = stderr
    }
}

@Collection("EnvVarSerial")
class AuthLibraryEndToEndTests : IDisposable {
    init() {
        CliServiceFactory.Reset()
    }

    func Dispose() {
        CliServiceFactory.AuthServiceFactory = func() IAuthService { return FakeAuthService() }
        CliServiceFactory.LibraryServiceFactory = func() ILibraryService { return FakeLibraryService() }
        CliServiceFactory.Reset()
    }

    @Fact
    func AuthStatus_NoProfiles_ExitsThree() {
        var result = RunCmd([]string{"auth", "status", "--json"})
        Assert.Equal(3, result.Exit)
    }

    @Fact
    func AuthStatus_ListsSessionsAsJson() {
        var auth = FakeAuthService()
        auth.LoginAsync(CliRegion.De, NonInteractiveCallbackBroker()).Wait()
        CliServiceFactory.AuthServiceFactory = func() IAuthService { return auth }

        var result = RunCmd([]string{"auth", "status", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Contains("\"region\": \"de\"", result.Stdout)
        Assert.Contains("\"isActive\": true", result.Stdout)
        Assert.Contains("\"resource\": \"auth-status\"", result.Stdout)
    }

    @Fact
    func LibraryList_FiltersBySearch() {
        var lib = FakeLibraryService([]LibraryItem{
            LibraryItem() { Asin = "A1", Title = "Project Hail Mary" },
            LibraryItem() { Asin = "A2", Title = "Dune" },
        })
        CliServiceFactory.LibraryServiceFactory = func() ILibraryService { return lib }

        var result = RunCmd([]string{"library", "list", "--filter", "Hail", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Contains("\"count\": 1", result.Stdout)
        Assert.Contains("\"asin\": \"A1\"", result.Stdout)
        Assert.DoesNotContain("Dune", result.Stdout)
    }

    @Fact
    func LibraryShow_MissingAsin_ExitsOne() {
        var result = RunCmd([]string{"library", "show", "B0FAKE"})
        Assert.Equal(1, result.Exit)
    }

    @Fact
    func LibraryShow_FoundAsin_EmitsJson() {
        var lib = FakeLibraryService([]LibraryItem{
            LibraryItem() { Asin = "A1", Title = "Test", Authors = []string{"X"} },
        })
        CliServiceFactory.LibraryServiceFactory = func() ILibraryService { return lib }

        var result = RunCmd([]string{"library", "show", "A1", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Contains("\"resource\": \"library-show\"", result.Stdout)
        Assert.Contains("\"asin\": \"A1\"", result.Stdout)
    }

    @Fact
    func AuthLogin_PositionalRegionParses() {
        var auth = FakeAuthService()
        CliServiceFactory.AuthServiceFactory = func() IAuthService { return auth }
        var result = RunCmd([]string{"auth", "login", "uk", "--browser", "--no-sync", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Single(auth.ListSessionsAsync().Result)
    }

    @Fact
    func AuthLogin_BrowserFlag_UsesBrowserPath() {
        var auth = E2ERecordingFakeAuthService()
        CliServiceFactory.AuthServiceFactory = func() IAuthService { return auth }
        CliServiceFactory.LibraryServiceFactory = func() ILibraryService { return FakeLibraryService() }

        var result = RunCmd([]string{"auth", "login", "us", "--browser", "--no-sync", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.True(auth.BrowserLoginInvoked)
        Assert.Null(auth.LastCreds)
    }

    @Fact
    func AuthLogin_CredentialsFlow_UsesUsernamePasswordAndSyncs() {
        var auth = E2ERecordingFakeAuthService()
        var lib = FakeLibraryService([]LibraryItem{
            LibraryItem() { Asin = "A1", Title = "After-login book" },
        })
        CliServiceFactory.AuthServiceFactory = func() IAuthService { return auth }
        CliServiceFactory.LibraryServiceFactory = func() ILibraryService { return lib }

        var result = RunCmdWithStdin("hunter2\n", []string{"auth", "login", "uk", "--username", "user@example.com", "--password-stdin", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Equal("user@example.com", auth.LastCreds!!.Username)
        Assert.Equal("hunter2", auth.LastCreds!!.Password)
        Assert.False(auth.BrowserLoginInvoked)
        Assert.Contains("\"librarySynced\": true", result.Stdout)
        Assert.Contains("\"libraryCount\": 1", result.Stdout)
    }

    @Fact
    func AuthLogin_NoStdinAndNoCreds_ExitsAuthError() {
        var auth = E2ERecordingFakeAuthService()
        CliServiceFactory.AuthServiceFactory = func() IAuthService { return auth }

        var result = RunCmdWithStdin("", []string{"auth", "login", "us", "--json"})
        Assert.Equal(3, result.Exit)
        Assert.Null(auth.LastCreds)
        Assert.False(auth.BrowserLoginInvoked)
        Assert.Contains("Sign-in", result.Stderr)
    }

    @Fact
    func LibraryUnread_FiltersByMissingHistory() {
        let lib = FakeLibraryService([]LibraryItem{
            LibraryItem() { Asin = "AREAD", Title = "Read Book" },
            LibraryItem() { Asin = "AUNREAD", Title = "Unread Book" },
        })
        CliServiceFactory.LibraryServiceFactory = func() ILibraryService { return lib }

        let fakeJobs = E2EFakeJobService()
        fakeJobs.SeedHistory(JobRecord() {
            Id = "j1",
            Asin = "AREAD",
            Title = "Read Book",
            TerminalPhase = JobPhase.Completed,
            StartedAt = DateTimeOffset.UtcNow,
            CompletedAt = DateTimeOffset.UtcNow,
        })
        CliServiceFactory.JobServiceFactory = func() IJobService { return fakeJobs }

        let result = RunCmd([]string{"library", "list", "--unread", "--json"})
        Assert.Equal(0, result.Exit)
        Assert.Contains("AUNREAD", result.Stdout)
        Assert.DoesNotContain("AREAD\"", result.Stdout)
    }

    func RunCmd(args []string) E2EAuthCmdResult {
        return RunCmdWithStdin(nil, args)
    }

    func RunCmdWithStdin(stdin string?, args []string) E2EAuthCmdResult {
        var origOut = Console.Out
        var origErr = Console.Error
        var origIn = Console.In
        var origCliOut = CliEnvironment.Out
        var origCliErr = CliEnvironment.Error
        var sw = StringWriter()
        var ew = StringWriter()
        Console.SetOut(sw)
        Console.SetError(ew)
        if stdin != nil {
            Console.SetIn(StringReader(stdin!!))
        }
        CliEnvironment.Out = sw
        CliEnvironment.Error = ew
        try {
            var root = RootCommandFactory.Create(func() ILoggerFactory { return NullLoggerFactory.Instance })
            var parse = root.Parse(args)
            var exit = parse.InvokeAsync().Result
            return E2EAuthCmdResult(exit, sw.ToString(), ew.ToString())
        } finally {
            Console.SetOut(origOut)
            Console.SetError(origErr)
            Console.SetIn(origIn)
            CliEnvironment.Out = origCliOut
            CliEnvironment.Error = origCliErr
        }
    }
}

class E2ERecordingFakeAuthService : IAuthService {
    var inner FakeAuthService?

    prop LastCreds AuthCredentials? { get; set; }
    prop BrowserLoginInvoked bool { get; set; }

    func getInner() FakeAuthService {
        if inner == nil {
            inner = FakeAuthService()
        }
        return inner!!
    }

    func ListSessionsAsync(cancellationToken CancellationToken) Task[IReadOnlyList[AuthSession]] {
        return getInner().ListSessionsAsync(cancellationToken)
    }

    func GetActiveAsync(cancellationToken CancellationToken) Task[AuthSession?] {
        return getInner().GetActiveAsync(cancellationToken)
    }

    func LoginAsync(region CliRegion, broker IAuthCallbackBroker, preAmazonUsername bool, cancellationToken CancellationToken) Task[AuthSession] {
        BrowserLoginInvoked = true
        return getInner().LoginAsync(region, broker, preAmazonUsername, cancellationToken)
    }

    func LoginWithCredentialsAsync(region CliRegion, broker IAuthCallbackBroker, credentials AuthCredentials, preAmazonUsername bool, cancellationToken CancellationToken) Task[AuthSession] {
        LastCreds = credentials
        return getInner().LoginWithCredentialsAsync(region, broker, credentials, preAmazonUsername, cancellationToken)
    }

    func LogoutAsync(profileAlias string, cancellationToken CancellationToken) Task {
        return getInner().LogoutAsync(profileAlias, cancellationToken)
    }

    func RefreshAsync(profileAlias string, cancellationToken CancellationToken) Task[AuthSession] {
        return getInner().RefreshAsync(profileAlias, cancellationToken)
    }
}

class E2EFakeJobService : IJobService {
    var active List[JobSnapshot] = List[JobSnapshot]()
    var history List[JobRecord] = List[JobRecord]()

    func SeedHistory(r JobRecord) {
        history.Add(r)
    }

    func SubmitAsync(request JobRequest, cancellationToken CancellationToken) Task {
        return Task.CompletedTask
    }

    async func ObserveAll(cancellationToken CancellationToken) IAsyncEnumerable[JobUpdate] {
        await Task.CompletedTask
        if false {
            yield JobUpdate()
        }
    }

    async func ObserveAsync(jobId string, cancellationToken CancellationToken) IAsyncEnumerable[JobUpdate] {
        await Task.CompletedTask
        if false {
            yield JobUpdate()
        }
    }

    func Cancel(jobId string) bool {
        return false
    }

    func GetSnapshot(jobId string) JobSnapshot? {
        for s in active {
            if s.JobId == jobId {
                return s
            }
        }
        let none JobSnapshot? = nil
        return none
    }

    func ListActive() IReadOnlyList[JobSnapshot] {
        return active
    }

    async func ReadHistoryAsync(cancellationToken CancellationToken) IAsyncEnumerable[JobRecord] {
        for r in history {
            yield r
        }
        await Task.CompletedTask
    }
}
