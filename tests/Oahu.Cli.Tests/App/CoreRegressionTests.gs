package Oahu.Cli.Tests.App

import Oahu.BooksDatabase
import Oahu.Aux
import Oahu.CommonTypes
import Oahu.Common.Util
import Oahu.Core
import System
import System.IO
import System.Linq
import System.Linq.Expressions
import System.Net
import System.Net.Http
import System.Reflection
import System.Threading
import System.Threading.Tasks
import Xunit

class CoreRegressionTests : IDisposable {
    private let directory string = Path.Combine(Path.GetTempPath(), "oahu-core-regression-" + Guid.NewGuid().ToString("N"))
    private let handler RecordingHandler = RecordingHandler()
    private let http HttpClient
    private let api object
    private let library object

    init() {
        Directory.CreateDirectory(directory)
        let assembly = typeof(AudibleClient).Assembly
        let clientType = assembly.GetType("Oahu.Core.HttpClientEx", true)!!
        http = cast[HttpClient](Activator.CreateInstance(clientType,
            BindingFlags.Instance | BindingFlags.NonPublic, nil, []object{handler}, nil)!!)
        http.BaseAddress = Uri("https://example.invalid")
        let profileType = assembly.GetType("Oahu.Core.Profile", true)!!
        let profile = Activator.CreateInstance(profileType, true)!!
        let token = Activator.CreateInstance(assembly.GetType("Oahu.Core.TokenBearer", true)!!, true)!!
        token.GetType().GetProperty("AccessToken")!!.SetValue(token, "secret-test-token")
        profileType.GetProperty("Token")!!.SetValue(profile, token)
        library = Activator.CreateInstance(assembly.GetType("Oahu.Core.BookLibrary", true)!!,
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, nil, []object{directory}, nil)!!
        let refreshType = typeof(Func[object, Task]).GetGenericTypeDefinition().MakeGenericType(
            assembly.GetType("Oahu.Core.IProfile", true)!!, typeof(Task))
        let refresh = Delegate.CreateDelegate(refreshType,
            typeof(CoreRegressionTests).GetMethod("NoRefresh", BindingFlags.NonPublic | BindingFlags.Static)!!)
        api = Activator.CreateInstance(assembly.GetType("Oahu.Core.AudibleApi", true)!!,
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance, nil,
            []object{profile, http, http, library, refresh}, nil)!!
    }

    func Dispose() {
        http.Dispose()
        using let connection = Microsoft.Data.Sqlite.SqliteConnection("Data Source=" + Path.Combine(directory, "audiobooks.db"))
        Microsoft.Data.Sqlite.SqliteConnection.ClearPool(connection)
        Directory.Delete(directory, recursive: true)
    }

    @Fact
    async func Download_Truncates_Previous_Output_Even_When_New_Download_Is_Incomplete() {
        let stub = Path.Combine(directory, "book")
        File.WriteAllBytes(stub + ".aaxc", [20]uint8)
        handler.Bytes = []uint8{1, 2, 3}
        let conversion = Conversion{
            Book: Book{Asin: "test", FileSizeBytes: 4L},
            DownloadFileName: stub,
            DownloadUrl: "https://example.invalid/book"
        }
        let succeeded = await cast[Task[bool]](Invoke(api, "DownloadAsync", []object{
            conversion, Action[Conversion, int64]((_ Conversion, _ int64) -> { }), CancellationToken.None
        }))
        Assert.False(succeeded)
        Assert.Equal(EConversionState.DownloadError, conversion.State)
        Assert.Equal(handler.Bytes, File.ReadAllBytes(stub + ".aaxc"))
    }

    @Theory
    @InlineData(0L)
    @InlineData(-1L)
    async func Invalid_Download_Size_Leaves_A_Failure_State(size int64) {
        let conversion = Conversion{
            Book: Book{FileSizeBytes: size},
            DownloadUrl: "https://example.invalid/book"
        }
        let result = await cast[Task[bool]](Invoke(api, "DownloadAsync", []object{
            conversion, Action[Conversion, int64]((_ Conversion, _ int64) -> { }), CancellationToken.None
        }))
        Assert.False(result)
        Assert.Equal(EConversionState.DownloadError, conversion.State)
    }

    @Fact
    async func Missing_Encrypted_File_Leaves_A_Failure_State() {
        let conversion = Conversion{DownloadFileName: Path.Combine(directory, "missing")}
        let result = await cast[Task[bool]](Invoke(api, "DecryptAsync", []object{
            conversion, Action[Conversion, TimeSpan]((_ Conversion, _ TimeSpan) -> { }), CancellationToken.None
        }))
        Assert.False(result)
        Assert.Equal(EConversionState.UnlockingFailed, conversion.State)
    }

    @Fact
    async func Byte_Request_Transport_Error_Does_Not_Throw_From_Catch() {
        handler.Fail = true
        using let request = HttpRequestMessage(HttpMethod.Get, "/failed")
        let task = cast[Task](Invoke(api, "SendForBytesAsync", []object{request, http}))
        await task
        Assert.Null(task.GetType().GetProperty("Result")!!.GetValue(task))
    }

    @Fact
    async func User_Profile_Uses_Bearer_Header_Not_Query_String() {
        let task = cast[Task](Invoke(api, "GetUserProfileAsync", Array.Empty[object]()))
        await task
        Assert.Equal("https://example.invalid/user/profile", handler.Url)
        Assert.Equal("Bearer secret-test-token", handler.Authorization)
    }

    @Theory
    @InlineData("https://example.invalid/login?a=1#fragment", "?a=1&email=test%40example.com")
    @InlineData("https://example.invalid/login", "?email=test%40example.com")
    async func Get_Form_Appends_Encoded_Fields_Without_Corrupting_Existing_Query(action string, expected string) {
        let loginType = typeof(AudibleClient).Assembly.GetType("Oahu.Core.ProgrammaticLogin", true)!!
        let task = cast[Task](loginType.GetMethod("SubmitFormAsync", BindingFlags.Static | BindingFlags.NonPublic)!!.Invoke(nil,
            []object{http, http.BaseAddress!!, action, "GET",
                System.Collections.Generic.Dictionary[string, string]{["email"] = "test@example.com"}})!!)
        await task
        Assert.Equal(expected, Uri(handler.Url!!).Query)
    }

    @Fact
    func Missing_Chapter_Relationship_Is_An_Empty_Result_Not_An_Exception() {
        let book = Book{Asin: "missing-chapters", Title: "Missing chapters"}
        {
            using let database = BookDbContext(directory)
            database.Database.EnsureCreated()
            database.Books.Add(book)
            database.SaveChanges()
        }
        Invoke(library, "GetChapters", []object{book})
        Assert.Null(book.ChapterInfo)
    }

    @Fact
    func File_State_Confirmation_Is_Per_Invocation_And_Publishes_Only_Resolved_State() {
        let book = Book{
            Asin: "missing-files",
            Title: "Missing files",
            Conversion: Conversion{
                AccountId: 1, Region: ERegion.Us, State: EConversionState.Exported,
                DownloadFileName: Path.Combine(directory, "missing")
            }
        }
        {
            using let database = BookDbContext(directory)
            database.Database.EnsureCreated()
            database.Books.Add(book)
            database.SaveChanges()
        }
        let prompt = FilePrompt()
        let reported = System.Collections.Generic.List[EConversionState]()
        let callback Action[IConversion] = (c IConversion) -> reported.Add(c.State)
        let args = []object{
            ProfileId(1, ERegion.Us),
            DownloadSettings{DownloadDirectory: directory},
            ExportSettings{ExportDirectory: directory},
            callback, prompt
        }
        Invoke(library, "CheckUpdateFilesAndState", args)
        Assert.Empty(reported)
        prompt.Answer = false
        Invoke(library, "CheckUpdateFilesAndState", args)
        Assert.Equal([]EConversionState{EConversionState.Remote}, reported.ToArray())
        reported.Clear()
        prompt.Answer = true
        Invoke(library, "CheckUpdateFilesAndState", args)
        Assert.Equal(3, prompt.Calls)
        Assert.Equal([]EConversionState{EConversionState.Remote}, reported.ToArray())
        using let verify = BookDbContext(directory)
        Assert.Equal(EConversionState.Remote, verify.Conversions.Single().State)
    }

    @Fact
    async func Explicit_Refresh_Works_When_Automatic_Refresh_Is_Disabled() {
        let assembly = typeof(AudibleClient).Assembly
        let profile = api.GetType().GetProperty("Profile", BindingFlags.Instance | BindingFlags.NonPublic)!!.GetValue(api)!!
        profile.GetType().GetProperty("Region")!!.SetValue(profile, ERegion.Us)
        let token = profile.GetType().GetProperty("Token")!!.GetValue(profile)!!
        token.GetType().GetProperty("Expiration")!!.SetValue(token, DateTime.UtcNow.AddMinutes(-1))
        token.GetType().GetProperty("RefreshToken")!!.SetValue(token, "refresh-test-token")
        http.BaseAddress = Uri("https://api.amazon.com")
        handler.Bytes = System.Text.Encoding.UTF8.GetBytes("{\"access_token\":\"updated\",\"expires_in\":3600}")
        let configuration = Activator.CreateInstance(assembly.GetType("Oahu.Core.Configuration", true)!!, true)!!
        configuration.GetType().GetMethod("AddOrReplace")!!.Invoke(configuration, []object{profile})
        let delegateType = assembly.GetType("Oahu.Core.ConfigTokenDelegate", true)!!
        let resultType = delegateType.GetMethod("Invoke")!!.ReturnType
        // Stop at the persistence boundary: this test must never write the user's config.
        let stopSaving = Expression.Lambda(delegateType,
            Expression.Throw(Expression.New(typeof(OperationCanceledException)), resultType),
            Expression.Parameter(typeof(bool), "enforce")).Compile()
        let type = assembly.GetType("Oahu.Core.Authorize", true)!!
        let authorize = Activator.CreateInstance(type, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance,
            nil, []object{stopSaving, DownloadSettings{AutoRefresh: false}}, nil)!!
        type.GetProperty("Configuration", BindingFlags.NonPublic | BindingFlags.Instance)!!.SetValue(authorize, configuration)
        type.GetProperty("HttpClientAmazon")!!.SetValue(authorize, http)
        try {
            let automatic = type.GetMethods(BindingFlags.NonPublic | BindingFlags.Instance)
                .Single((m MethodInfo) -> m.Name == "RefreshTokenAsync" && m.GetParameters().Length == 2)
            await cast[Task](automatic.Invoke(authorize, []object{profile, true})!!)
            Assert.Null(handler.Url)
            let explicitRefresh = type.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Single((m MethodInfo) -> m.Name == "RefreshTokenAsync" && m.GetParameters().Length == 1)
            await Assert.ThrowsAsync[OperationCanceledException](async () -> {
                await cast[Task](explicitRefresh.Invoke(authorize, []object{profile})!!)
            })
            Assert.NotNull(handler.Url)
            Assert.Equal("updated", token.GetType().GetProperty("AccessToken")!!.GetValue(token))
        } finally {
            cast[HttpClient](type.GetProperty("HttpClientAudible")!!.GetValue(authorize)!!).Dispose()
        }
    }

    @Fact
    async func Conversion_Task_Failure_Is_Always_Observed() {
        let stub = Path.Combine(directory, "already-downloaded")
        File.WriteAllBytes(stub + ".aaxc", []uint8{1})
        File.WriteAllBytes(stub + ".m4b", []uint8{1})
        let book = Book{Asin: "convert-failure", Title: "Convert failure"}
        let conversion = Conversion{Book: book, State: EConversionState.LocalUnlocked, DownloadFileName: stub}
        book.Conversion = conversion
        let fake = DispatchProxy.Create[IAudibleApi, ConversionApiProxy]()
        using let job = DownloadDecryptJob[NoCancellation](fake,
            DownloadSettings{DownloadDirectory: directory, KeepEncryptedFiles: true}, (_ Conversion) -> { })
        let error = await Assert.ThrowsAsync[IOException](async () -> {
            await job.DownloadDecryptAndConvertAsync([]Conversion{conversion},
                Progress[ProgressMessage]((_ ProgressMessage) -> { }), NoCancellation(),
                (_ Book, _ NoCancellation, _ (Conversion) -> void) -> { throw IOException("export failed") })
        })
        Assert.Equal("export failed", error.Message)
    }

    @Fact
    async func Submission_Failure_Waits_For_Already_Started_Conversions() {
        let stub = Path.Combine(directory, "already-downloaded")
        File.WriteAllBytes(stub + ".aaxc", []uint8{1})
        File.WriteAllBytes(stub + ".m4b", []uint8{1})
        let book = Book{Asin: "convert-pending", Title: "Convert pending"}
        let conversion = Conversion{Book: book, State: EConversionState.LocalUnlocked, DownloadFileName: stub}
        book.Conversion = conversion
        let rejected = Conversion{Book: book, State: EConversionState.LocalUnlocked, DownloadFileName: stub}
        using let started = ManualResetEventSlim()
        using let release = ManualResetEventSlim()
        let fake = DispatchProxy.Create[IAudibleApi, ConversionApiProxy]()
        let proxy = cast[ConversionApiProxy](fake)
        proxy.Reject = rejected
        proxy.BeforeReject = () -> Assert.True(started.Wait(TimeSpan.FromSeconds(5)))
        using let job = DownloadDecryptJob[NoCancellation](fake,
            DownloadSettings{DownloadDirectory: directory, KeepEncryptedFiles: true}, (_ Conversion) -> { })
        let run = job.DownloadDecryptAndConvertAsync([]Conversion{conversion, rejected},
            Progress[ProgressMessage]((_ ProgressMessage) -> { }), NoCancellation(),
            (_ Book, _ NoCancellation, _ (Conversion) -> void) -> {
                started.Set()
                Assert.True(release.Wait(TimeSpan.FromSeconds(5)))
            })
        let completedEarly = run.IsCompleted
        release.Set()
        let error = await Assert.ThrowsAsync[IOException](async () -> await run)
        Assert.False(completedEarly)
        Assert.Equal("submission failed", error.Message)
    }

    class NoCancellation : ICancellation {
        prop CancellationToken CancellationToken -> CancellationToken.None
    }

    open class ConversionApiProxy : DispatchProxy {
        prop Reject Conversion?
        prop BeforeReject Action?
        protected override func Invoke(targetMethod MethodInfo?, args[]?object?) object? {
            if targetMethod!!.Name == "GetPersistentState" && Object.ReferenceEquals(args!![0], Reject) {
                BeforeReject?.Invoke()
                throw IOException("submission failed")
            }
            return switch targetMethod!!.Name {
                case "GetPersistentState": EConversionState.LocalUnlocked
                case "RestorePersistentState" or "Dispose": default(object?)
                default: throw NotSupportedException(targetMethod!!.Name)
            }
        }
    }

    private class FilePrompt : IInteractionCallback[InteractionMessage[BookLibInteract], bool?] {
        prop Answer bool?
        prop Calls int32
        func Interact(value InteractionMessage[BookLibInteract]) bool? {
            Calls++
            return Answer
        }
    }

    shared {
        private func NoRefresh(profile object) Task -> Task.CompletedTask

        private func Invoke(target object, name string, args[]object) object ->
            target.GetType().GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                .Single((m MethodInfo) -> m.Name == name && m.GetParameters().Length == args.Length)
                .Invoke(target, args) ?? System.Object()
    }

    private class RecordingHandler : HttpMessageHandler {
        init() { Bytes = []uint8{1} }
        prop Bytes[]uint8
        prop Fail bool
        prop Url string?
        prop Authorization string?
        protected override func SendAsync(request HttpRequestMessage, cancellationToken CancellationToken) Task[HttpResponseMessage] {
            if Fail { throw HttpRequestException("test transport failure") }
            Url = request.RequestUri!!.ToString()
            Authorization = request.Headers.Authorization?.ToString()
            return Task.FromResult(HttpResponseMessage(HttpStatusCode.OK){Content = ByteArrayContent(Bytes)})
        }
    }
}
