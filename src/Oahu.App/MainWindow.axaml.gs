package Oahu.App.Avalonia

import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import Avalonia.Controls
import Avalonia.Controls.Notifications
import Avalonia.Interactivity
import Avalonia.Threading
import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.BooksDatabase
import Oahu.Common.Util
import Oahu.Core
import Oahu.Core.UI.Avalonia.ViewModels
import Oahu.Aux.Logging
import Oahu.Audible.Json

open partial class MainWindow : Window {
    private let viewModel MainWindowViewModel?
    private let userSettings UserSettings
    private var initDone bool
    private var databaseInitialized bool
    private var cts CancellationTokenSource?
    private var notificationManager WindowNotificationManager?

    init() {
        InitializeComponent()
    }

    convenience init(viewModel MainWindowViewModel, userSettings UserSettings) {
        init()
        this.viewModel = viewModel
        this.userSettings = userSettings
        DataContext = viewModel
    }

    protected open override async func OnOpened(e EventArgs) void {
        base.OnOpened(e)
        if initDone || viewModel == nil {
            return
        }
        initDone = true
        await InitAsync()
    }

    private async func InitAsync() {
        using let logGuard = LogGuard(3, this)
        notificationManager = WindowNotificationManager(this){Position = NotificationPosition.BottomRight, MaxItems = 3}
        viewModel!!.SetBusy(true, "Initializing...")
        try {
            let client = viewModel!!.AudibleClient
            // Run setup wizard if no profiles exist (mirrors Windows runWizardAsync)
            Log(4, this, () -> "before wizard")
            await RunWizardAsync(client)
            await EnsureDatabaseInitializedAsync()
            await LoadActiveProfileAsync()
            this.viewModel!!.IsInitialized = true
            Log(4, this, () -> "all done")
        } catch (ex Exception) {
            Log(1, this, () -> "init error: ${ex.Message}")
            viewModel!!.SetBusy(false, "Initialization error: ${ex.Message}")
        }
    }

    private async func RunWizardAsync(client AudibleClient, force bool = false) bool {
        using let logGuard = LogGuard(3, this)
        let profiles = await client.GetProfilesAsync()
        let needsProfile = force || profiles.IsNullOrEmpty()
        if !needsProfile {
            Log(3, this, () -> "profiles exist, skipping wizard")
            return false
        }
        Log(
            3,
            this,
            () -> if force {
                "showing setup wizard on demand"
            } else {
                "no profiles found, showing setup wizard"
            }
        )
        let wizardVm = ProfileWizardViewModel()
        wizardVm.SetClient(client)
        wizardVm.SetSettings(userSettings.DownloadSettings, userSettings.ExportSettings)
        let wizardWindow = SetupWizardWindow(wizardVm)
        let registered = await wizardWindow.ShowWizardAsync(this)
        if !registered {
            Log(1, this, () -> "wizard: no profile was created")
            this.viewModel!!.StatusMessage = "Warning: No profile was created. You can create one later via Settings."
        }
        return registered
    }

    private async func EnsureDatabaseInitializedAsync() {
        if databaseInitialized {
            return
        }
        Log(4, this, () -> "before db")
        viewModel!!.SetBusy(true, "Initializing database...")
        let canConnect = await BookDbContextLazyLoad.StartupAsync()
        if !canConnect {
            throw InvalidOperationException("Database initialization failed.")
        }
        databaseInitialized = true
    }

    private async func LoadActiveProfileAsync() {
        using let logGuard = LogGuard(3, this)
        let client = viewModel!!.AudibleClient
        ClearLoadedSession()
        Log(4, this, () -> "before config")
        viewModel!!.SetBusy(true, "Loading configuration...")
        this.viewModel!!.CurrentProfile = await client.ConfigFromFileAsync(
            userSettings.DownloadSettings?.Profile,
            GetAccountAlias
        )
        if viewModel!!.CurrentProfile == nil {
            Log(3, this, () -> "no active profile loaded")
            viewModel!!.SetBusy(false, "Sign in to start the setup wizard.")
            return
        }
        userSettings.DownloadSettings!!.Profile = ProfileAliasKey(viewModel!!.CurrentProfile)
        userSettings.Save()
        this.viewModel!!.Api = client.Api!!
        if viewModel!!.Api == nil {
            Log(1, this, () -> "API is null after profile load — profile may be incomplete")
            ClearLoadedSession()
            viewModel!!.SetBusy(false, "Warning: API not initialized. Profile may be incomplete.")
            return
        }
        viewModel!!.Api!!.GetAccountAliasFunc = GetAccountAlias
        UpdateSignedInProfile()
        Log(
            3,
            this,
            () -> (
                "Profile loaded: region=${client.ProfileKey?.Region}, " +
                    "account=${client.ProfileKey?.AccountId ?? "(null)"}"
            )
        )
        if userSettings.DownloadSettings!!.AutoUpdateLibrary {
            viewModel!!.SetBusy(true, "Updating library...")
            let libraryResult LibraryResponse? = await viewModel!!.Api!!.GetLibraryAsync(false)
            if libraryResult == nil {
                Log(
                    1,
                    this,
                    () -> "Library sync returned null — API call likely failed. Check log for HTTP error details."
                )
                this.viewModel!!.StatusMessage = "Warning: Library sync failed. See logs for details."
            } else {
                Log(3, this, () -> "Library sync: ${libraryResult.Items?.Length ?? 0} book(s)")
            }
            viewModel!!.SetBusy(true, "Downloading cover images...")
            await viewModel!!.Api!!.DownloadCoverImagesAsync()
        } else {
            Log(3, this, () -> "AutoUpdateLibrary is disabled, skipping library sync")
        }
        viewModel!!.SetBusy(true, "Verifying downloaded files...")
        let resetCount = viewModel!!.Api!!.VerifyCompletedDownloads(
            userSettings.DownloadSettings,
            userSettings.ExportSettings
        )
        if resetCount > 0 {
            Log(3, this, () -> "$resetCount book(s) reset to Remote (output files missing)")
        }
        let books = viewModel!!.Api!!.GetBooks() ?? Enumerable.Empty[Book]()
        Log(3, this, () -> "Local books: ${books.Count()}")
        viewModel!!.BookLibrary.LoadBooks(books)
        WireLoadedSessionEvents()
        viewModel!!.SetBusy(false, "Ready")
    }

    private func ClearLoadedSession() {
        viewModel!!.BookLibrary.DownloadRequested -= OnDownloadRequested
        viewModel!!.BookLibrary.RefreshRequested -= OnLibraryRefreshRequested
        viewModel!!.Conversion.RunRequested -= OnRunDownloadPipeline
        viewModel!!.Conversion.CancelRequested -= OnCancelDownload
        viewModel!!.BookLibrary.LoadBooks(Array.Empty[Book]())
        viewModel!!.Conversion.Clear()
        viewModel!!.Conversion.UpdateOverallProgress(0.0, "Idle")
        viewModel!!.ClearSignedInProfile()
    }

    private func WireLoadedSessionEvents() {
        viewModel!!.BookLibrary.DownloadRequested -= OnDownloadRequested
        viewModel!!.BookLibrary.DownloadRequested += OnDownloadRequested
        viewModel!!.BookLibrary.RefreshRequested -= OnLibraryRefreshRequested
        viewModel!!.BookLibrary.RefreshRequested += OnLibraryRefreshRequested
        viewModel!!.Conversion.RunRequested -= OnRunDownloadPipeline
        viewModel!!.Conversion.RunRequested += OnRunDownloadPipeline
        viewModel!!.Conversion.CancelRequested -= OnCancelDownload
        viewModel!!.Conversion.CancelRequested += OnCancelDownload
    }

    private async func OnLibraryRefreshRequested(sender object, e EventArgs) void {
        using let logGuard = LogGuard(3, this)
        if viewModel?.Api == nil {
            Log(3, this, () -> "Refresh requested but no active profile/API.")
            return
        }
        try {
            viewModel!!.BookLibrary.SetRefreshing(true)
            viewModel!!.SetBusy(true, "Refreshing library...")
            let libraryResult LibraryResponse? = await viewModel!!.Api!!.GetLibraryAsync(false)
            if libraryResult == nil {
                Log(1, this, () -> "Library refresh returned null — API call likely failed.")
                this.viewModel!!.StatusMessage = "Warning: Library refresh failed. See logs for details."
            } else {
                Log(3, this, () -> "Library refresh: ${libraryResult.Items?.Length ?? 0} book(s)")
            }
            viewModel!!.SetBusy(true, "Downloading cover images...")
            await viewModel!!.Api!!.DownloadCoverImagesAsync()
            let books = viewModel!!.Api!!.GetBooks() ?? Enumerable.Empty[Book]()
            Log(3, this, () -> "Local books after refresh: ${books.Count()}")
            viewModel!!.BookLibrary.LoadBooks(books)
            viewModel!!.SetBusy(false, "Ready")
        } catch (ex Exception) {
            Log(1, this, () -> "Library refresh error: ${ex.Message}")
            viewModel!!.SetBusy(false, "Refresh error: ${ex.Message}")
        } finally {
            viewModel!!.BookLibrary.SetRefreshing(false)
        }
    }

    private func UpdateSignedInProfile() {
        let client AudibleClient? = viewModel!!.AudibleClient
        let parts = List[string]()
        if !viewModel!!.CurrentProfile?.AccountAlias.IsNullOrWhiteSpace() ?? false {
            parts.Add(viewModel!!.CurrentProfile!!.AccountAlias!!)
        }
        if client?.ProfileKey != nil {
            parts.Add(client!!.ProfileKey!!.Region.ToString())
        }
        let subtitle = if parts.Count > 0 {
            string.Join(" • ", parts)
        } else {
            "Audible account"
        }
        viewModel!!.SetSignedInProfile(client?.CurrentCustomerName, client?.CurrentGivenName, subtitle)
    }

    private func OnDownloadRequested(sender object, selectedBooks IEnumerable[BookItemViewModel]) {
        let books = selectedBooks.ToList()
        Log(3, this, () -> "download requested for ${books.Count} book(s)")
        for bookVm in books {
            viewModel!!.Conversion.AddConversion(bookVm.Book)
        }
        this.viewModel!!.StatusMessage = "${viewModel!!.Conversion.QueuedCount} book(s) queued for download."
    }

    private func OnCancelDownload() {
        Log(3, this, () -> "cancel requested")
        cts?.Cancel()
    }

    private async func OnSignInClicked(sender object, e RoutedEventArgs) void {
        if viewModel!!.IsBusy {
            return
        }
        if viewModel!!.Conversion.IsRunning {
            this.viewModel!!.StatusMessage = "Finish or cancel the current download before signing in again."
            return
        }
        try {
            let registered = await RunWizardAsync(viewModel!!.AudibleClient, true)
            if !registered {
                this.viewModel!!.StatusMessage = "Sign-in cancelled."
                return
            }
            await EnsureDatabaseInitializedAsync()
            await LoadActiveProfileAsync()
        } catch (ex Exception) {
            Log(1, this, () -> "sign-in error: ${ex.Message}")
            viewModel!!.SetBusy(false, "Sign-in error: ${ex.Message}")
        }
    }

    private async func OnSignOutClicked(sender object, e RoutedEventArgs) void {
        if viewModel!!.IsBusy {
            return
        }
        if viewModel!!.Conversion.IsRunning {
            let message = "Finish or cancel the current download before signing out."
            this.viewModel!!.StatusMessage = message
            notificationManager?.Show(Notification("Sign-out unavailable", message, NotificationType.Warning))
            return
        }
        try {
            viewModel!!.SetBusy(true, "Signing out...")
            let removed = await viewModel!!.AudibleClient.RemoveAllProfilesAsync()
            if !removed {
                throw InvalidOperationException("One or more stored profiles could not be removed.")
            }
            userSettings.DownloadSettings!!.Profile = nil
            userSettings.Save()
            ClearLoadedSession()
            viewModel!!.SetBusy(false, "Signed out. Use Sign in to start the setup wizard.")
            notificationManager?.Show(
                Notification(
                    "Signed out",
                    "Stored credentials were removed from this device.",
                    NotificationType.Information
                )
            )
        } catch (ex Exception) {
            Log(1, this, () -> "sign-out error: ${ex.Message}")
            viewModel!!.SetBusy(false, "Sign-out error: ${ex.Message}")
        }
    }

    private async func OnRunDownloadPipeline(items IReadOnlyList[ConversionItemViewModel]) {
        using let lg = LogGuard(3, this, () -> "#items=${items.Count}")
        cts = CancellationTokenSource()
        let api IAudibleApi? = viewModel!!.Api
        if api == nil {
            this.viewModel!!.StatusMessage = "Error: API not initialized."
            return
        }
        let conversions = items
            .Select((i ConversionItemViewModel) -> i.Conversion)
            .Where((c Conversion) -> c != nil)
            .ToList()
        if conversions.Count == 0 {
            this.viewModel!!.StatusMessage = "No downloadable items in queue."
            return
        }
        // Lookup from Conversion to UI item for progress updates
        let lookup = items.ToDictionary(
            func (i ConversionItemViewModel) string {
                return i.Asin
            }
        )
        let totalItems = conversions.Count
        var completedItems = 0
        // Per-item accumulated progress for download (permille) and decrypt (percent)
        let downloadPermille = Dictionary[string, int32]()
        let decryptPercent = Dictionary[string, int32]()
        let itemProgress = Dictionary[string, float64]()
        let progress = Progress[ProgressMessage](
            (msg ProgressMessage) -> {
                Dispatcher.UIThread.Post(
                    () -> {
                        if (msg.IncItem != nil) {
                            completedItems += msg.IncItem!!
                        }
                        // Per-item download progress (0% to 50% of item bar)
                        if (msg.IncStepsPerMille != nil) && msg.Asin != nil && lookup.TryGetValue(
                            msg.Asin!!,
                            out var dlItem
                        ) {
                            let accumulated = downloadPermille.GetValueOrDefault(msg.Asin!!) + msg.IncStepsPerMille!!
                            downloadPermille[msg.Asin!!] = accumulated
                            let p = Math.Min(float64(accumulated) / 1000.0, 1.0) * 0.5
                            itemProgress[msg.Asin!!] = p
                            dlItem.UpdateProgress(p)
                        }
                        // Per-item decrypt progress (50% to 100% of item bar)
                        if (msg.IncStepsPerCent != nil) && msg.Asin != nil && lookup.TryGetValue(
                            msg.Asin!!,
                            out var decItem
                        ) {
                            let accumulated = decryptPercent.GetValueOrDefault(msg.Asin!!) + msg.IncStepsPerCent!!
                            decryptPercent[msg.Asin!!] = accumulated
                            let p = 0.5 + Math.Min(float64(accumulated) / 100.0, 1.0) * 0.5
                            itemProgress[msg.Asin!!] = p
                            decItem.UpdateProgress(p)
                        }
                        // Overall progress: average of all per-item progress
                        let overallPct = if totalItems > 0 {
                            itemProgress.Values.Sum() / float64(totalItems)
                        } else {
                            float64(0.0)
                        }
                        viewModel!!.Conversion.UpdateOverallProgress(
                            overallPct,
                            "Processing $completedItems of $totalItems..."
                        )
                    }
                )
            }
        )
        let onStateChanged(Conversion) -> void = (conv Conversion?) -> {
            Dispatcher.UIThread.Post(
                () -> {
                    if conv?.Book?.Asin == nil {
                        return
                    }
                    if !lookup.TryGetValue(conv!!.Book!!.Asin!!, out var itemVm) {
                        return
                    }
                    itemVm.UpdateState(conv!!.State)
                    // Check if this item has reached a terminal success state
                    let done = (
                        conv!!.State is EConversionState.LocalUnlocked or
                            EConversionState.Exported or
                            EConversionState.Converted
                    )
                    if done {
                        // Mark item as fully complete for overall progress calculation
                        itemProgress[conv!!.Book!!.Asin!!] = 1.0
                        itemVm.UpdateProgress(1.0)
                        let title = (conv!!.Book!!.Title ?? conv!!.Book!!.Asin)!!
                        let stateLabel = switch conv!!.State {
                            case EConversionState.Exported: "downloaded and exported"
                            default: "downloaded and decrypted"
                        }
                        notificationManager?.Show(
                            Notification(
                                "Download Complete",
                                "\"$title\" has been $stateLabel.",
                                NotificationType.Success
                            )
                        )
                        viewModel!!.Conversion.RemoveConversion(conv!!.Book!!.Asin!!)
                        lookup.Remove(conv!!.Book!!.Asin!!)
                    }
                }
            )
        }
        // Build the export action
        let doExport = userSettings.ExportSettings?.ExportToAax ?? false
        var exporter AaxExporter? = nil
        if doExport {
            exporter = AaxExporter(userSettings.ExportSettings, userSettings.DownloadSettings)
        }
        this.viewModel!!.StatusMessage = "Downloading..."
        try {
            using let job = DownloadDecryptJob[SimpleCancellation](api, userSettings.DownloadSettings, onStateChanged)
            var convertAction ConvertDelegate[SimpleCancellation]? = nil
            if doExport && exporter != nil {
                convertAction = (book Book, ctx SimpleCancellation, callback(Conversion) -> void) -> {
                    exporter!!.Export(book, SimpleConversionContext(nil, ctx.CancellationToken), callback)
                }
            }
            let context = SimpleCancellation(cts!!.Token)
            await job.DownloadDecryptAndConvertAsync(conversions, progress, context, convertAction)
            this.viewModel!!.StatusMessage = if cts!!.IsCancellationRequested {
                "Download cancelled."
            } else {
                "Download complete."
            }
        } catch (OperationCanceledException) {
            this.viewModel!!.StatusMessage = "Download cancelled."
        } catch (ex Exception) {
            Log(1, this, () -> "pipeline error: ${ex.Message}")
            this.viewModel!!.StatusMessage = "Download error: ${ex.Message}"
        } finally {
            cts?.Dispose()
            cts = nil
            // Refresh states for any items still in the queue (errors, cancelled, etc.)
            for kvp in lookup {
                let item ConversionItemViewModel? = items.FirstOrDefault(
                    (i ConversionItemViewModel) -> i.Asin == kvp.Key
                )
                if item?.Conversion != nil {
                    item!!.UpdateState(item!!.Conversion.State)
                }
            }
            viewModel!!.Conversion.UpdateOverallProgress(1.0, "Finished")
            viewModel!!.Conversion.UpdateQueuedCount()
        }
    }

    private func GetAccountAlias(ctxt AccountAliasContext) bool {
        // Auto-accept the alias with customer name for now
        if ctxt.Alias.IsNullOrWhiteSpace() {
            ctxt.Alias = ctxt.CustomerName!!
        }
        return true
    }
}
