package Oahu.Core.UI.Avalonia.ViewModels

import CommunityToolkit.Mvvm.ComponentModel
import CommunityToolkit.Mvvm.Input
import Oahu.BooksDatabase
import System
import System.Collections.Generic
import System.Collections.ObjectModel
import System.Linq
import System.Threading.Tasks

partial class ConversionViewModel : ObservableObject {
    @ObservableProperty
    private var conversions ObservableCollection[ConversionItemViewModel] = ObservableCollection[
        ConversionItemViewModel
    ]()

    @ObservableProperty
    private var isIdle bool = true

    @ObservableProperty
    private var isRunning bool

    @ObservableProperty
    private var queuedCount int32

    @ObservableProperty
    private var overallProgress float64

    @ObservableProperty
    private var overallStatusText string

    /// Raised when the user clicks Run. The MainWindow handles the actual pipeline.
    event RunRequested Func[IReadOnlyList[ConversionItemViewModel], Task]

    /// Raised when the user clicks Cancel during a running pipeline.
    event CancelRequested Action

    func AddConversion(book Book) {
        // Avoid duplicates
        if Conversions.Any((c ConversionItemViewModel) -> c.Asin == book.Asin) {
            return
        }
        Conversions.Add(ConversionItemViewModel(book))
        UpdateQueuedCount()
    }

    func Clear() {
        Conversions.Clear()
        UpdateQueuedCount()
    }

    func RemoveConversion(asin string) bool {
        let item ConversionItemViewModel? = Conversions.FirstOrDefault((c ConversionItemViewModel) -> c.Asin == asin)
        if item == nil {
            return false
        }
        Conversions.Remove(item)
        UpdateQueuedCount()
        return true
    }

    func UpdateQueuedCount() -> QueuedCount = Conversions.Count

    func UpdateOverallProgress(progress float64, status string?) {
        OverallProgress = progress
        if status != nil {
            OverallStatusText = status
        }
    }

    @RelayCommand
    private func RemoveSelected() {
        let toRemove = Conversions.Where((c ConversionItemViewModel) -> c.IsSelected).ToList()
        for item in toRemove {
            Conversions.Remove(item)
        }
        UpdateQueuedCount()
    }

    @RelayCommand
    private async func Run() {
        if Conversions.Count == 0 || RunRequested == nil {
            return
        }
        IsRunning = true
        IsIdle = false
        OverallProgress = 0.0
        OverallStatusText = "Starting..."
        try {
            await RunRequested(Conversions.ToList().AsReadOnly())
        } finally {
            IsRunning = false
            IsIdle = true
            OverallStatusText = "Finished"
        }
    }

    @RelayCommand
    private func Cancel() {
        CancelRequested?()
    }
}

partial class ConversionItemViewModel : ObservableObject {
    private let book Book

    @ObservableProperty
    private var isSelected bool

    @ObservableProperty
    private var state EConversionState

    @ObservableProperty
    private var progress float64

    @ObservableProperty
    private var statusText string = "Queued"

    init(book Book) {
        this.book = book
    }

    prop Book Book -> book
    prop Title string -> book.Title!!
    prop Author string -> book.Author!!
    prop Asin string -> book.Asin!!
    prop Conversion Conversion -> book.Conversion!!

    func UpdateState(state EConversionState) {
        State = state
        StatusText = switch state {
            case EConversionState.Unknown: "Queued"
            case EConversionState.LicenseGranted: "Licensed"
            case EConversionState.LicenseDenied: "License denied"
            case EConversionState.Downloading: "Downloading..."
            case EConversionState.LocalLocked: "Downloaded"
            case EConversionState.DownloadError: "Download error"
            case EConversionState.Unlocking: "Decrypting..."
            case EConversionState.LocalUnlocked: "Decrypted"
            case EConversionState.UnlockingFailed: "Decrypt error"
            case EConversionState.Converting: "Exporting..."
            case EConversionState.Exported: "Exported"
            case EConversionState.ConversionError: "Export error"
            default: state.ToString()
        }
    }

    func UpdateProgress(value float64) {
        Progress = Math.Clamp(value, 0.0, 1.0)
    }
}
