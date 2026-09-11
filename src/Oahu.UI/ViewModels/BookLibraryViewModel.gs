package Oahu.Core.UI.Avalonia.ViewModels

import System
import System.Collections.Generic
import System.Collections.ObjectModel
import System.ComponentModel
import System.IO
import System.Linq
import System.Text.RegularExpressions
import CommunityToolkit.Mvvm.ComponentModel
import CommunityToolkit.Mvvm.Input
import Oahu.Aux
import Oahu.BooksDatabase
import Oahu.Core

partial class BookLibraryViewModel : ObservableObject {
    private var downloadSettings IDownloadSettings?

    @ObservableProperty
    private var books ObservableCollection[BookItemViewModel] = ObservableCollection[BookItemViewModel]()

    @ObservableProperty
    private var selectedBook BookItemViewModel?

    @ObservableProperty
    private var hasSelectedBook bool

    @ObservableProperty
    private var filterText string

    @ObservableProperty
    private var downloadSelectEnabled bool

    @ObservableProperty
    private var selectedCount int32

    @ObservableProperty
    private var isRefreshing bool

    init(downloadSettings IDownloadSettings? = nil) {
        SetDownloadSettings(downloadSettings)
    }

    event DownloadRequested EventHandler[IEnumerable[BookItemViewModel]]

    /// Raised when the user asks for a fresh library pull (toolbar button or
    /// the R keybinding). MainWindow handles this by re-running the
    /// Audible library sync and rebinding the resulting books.
    event RefreshRequested EventHandler

    prop SelectedBookAsin string

    // Sort state remembered within the session
    prop SortColumnIndex int32?

    prop SortDirection ListSortDirection?

    func LoadBooks(books IEnumerable[Book]) {
        Books.Clear()
        for book in books {
            let vm = BookItemViewModel(book)
            vm.PropertyChanged += (s object?, e PropertyChangedEventArgs) -> {
                if e.PropertyName == "IsSelected" {
                    UpdateSelectedCount()
                }
            }
            Books.Add(vm)
        }
        UpdateSelectedCount()
        if Books.Count == 0 {
            SelectedBook = nil
            return
        }
        let previousSelection BookItemViewModel? = if !string.IsNullOrWhiteSpace(SelectedBookAsin) {
            Books.FirstOrDefault((b BookItemViewModel) -> b.Asin == SelectedBookAsin)
        } else {
            default(BookItemViewModel?)
        }
        SelectedBook = previousSelection ?? Books[0]
    }

    func GetSelectedBooks() IEnumerable[BookItemViewModel] -> Books.Where((b BookItemViewModel) -> b.IsSelected)

    func UpdateSelectedCount() -> SelectedCount = Books.Count((b BookItemViewModel) -> b.IsSelected)

    func SetDownloadSettings(settings IDownloadSettings?) {
        if object.ReferenceEquals(downloadSettings, settings) {
            return
        }
        if downloadSettings != nil {
            this.downloadSettings!!.ChangedSettings -= OnDownloadSettingsChanged
        }
        downloadSettings = settings
        if downloadSettings != nil {
            this.downloadSettings!!.ChangedSettings += OnDownloadSettingsChanged
        }
        OpenDownloadsFolderCommand.NotifyCanExecuteChanged()
    }

    /// Toggle the spinner / disabled state on the refresh button. MainWindow
    /// calls this around the Audible round-trip so the user sees the click
    /// took effect even when the network is slow.
    func SetRefreshing(refreshing bool) {
        IsRefreshing = refreshing
        RefreshCommand.NotifyCanExecuteChanged()
    }

    private func OnSelectedBookChanged(value BookItemViewModel?) {
        HasSelectedBook = value != nil
        if value != nil {
            SelectedBookAsin = value.Asin
        }
    }

    @RelayCommand
    private func SelectAll() {
        for book in Books {
            book.IsSelected = true
        }
    }

    @RelayCommand
    private func DeselectAll() {
        for book in Books {
            book.IsSelected = false
        }
    }

    @RelayCommand
    private func DownloadSelected() {
        let selected = GetSelectedBooks().ToList()
        if selected.Count > 0 {
            DownloadRequested?(this, selected)
        }
    }

    @RelayCommand(CanExecute: "CanRefresh")
    private func Refresh() {
        RefreshRequested?(this, EventArgs.Empty)
    }

    private func CanRefresh() bool -> !IsRefreshing

    @RelayCommand(CanExecute: "CanOpenDownloadsFolder")
    private func OpenDownloadsFolder() {
        ShellExecute.Directory(downloadSettings?.DownloadDirectory)
    }

    private func CanOpenDownloadsFolder() bool -> !string.IsNullOrWhiteSpace(downloadSettings?.DownloadDirectory)

    private func OnDownloadSettingsChanged(
        sender object,
        e EventArgs
    ) -> OpenDownloadsFolderCommand.NotifyCanExecuteChanged()
}

partial class BookItemViewModel : ObservableObject {
    private let book Book

    @ObservableProperty
    private var isSelected bool

    init(book Book) {
        this.book = book
    }

    prop Book Book -> book
    prop Asin string -> book.Asin!!
    prop Title string -> book.Title!!
    prop Author string -> book.Author!!
    prop Narrator string -> book.Narrator!!
    prop PurchaseDate DateTime? -> book.PurchaseDate
    prop ReleaseDate DateTime? -> book.ReleaseDate
    prop RunTimeLengthSeconds int32? -> book.RunTimeLengthSeconds
    prop CoverImageFile string -> book.CoverImageFile!!
    prop ConversionState EConversionState -> book.Conversion?.State ?? EConversionState.Unknown

    prop Duration string? {
        get {
            if RunTimeLengthSeconds == nil {
                return nil
            }
            let ts = TimeSpan.FromSeconds(RunTimeLengthSeconds!!)
            return if ts.TotalHours >= float64(1.0) {
                "${int32(ts.TotalHours)}h ${ts.Minutes:D2}m"
            } else {
                "${ts.Minutes}m"
            }
        }
    }

    // Detail properties
    prop Publisher string -> book.PublisherName!!

    prop Language string -> book.Language!!

    prop Unabridged string? -> switch book.Unabridged {
        case true: "Yes"
        case false: "No"
        default: default(string?)
    }

    prop Series string? -> if book.Series?.Count > 0 {
        string.Join(", ", book.Series!!.Select((s SeriesBook) -> s.ToString()))
    } else {
        default(string?)
    }
    prop ConversionStateText string -> ConversionState.ToString()
    prop Parts int32? -> if book.Components?.Count > 0 {
        book.Components!!.Count
    } else {
        default(int32?)
    }

    prop Description string? {
        get {
            let html = book.PublisherSummary
            if string.IsNullOrWhiteSpace(html) {
                return nil
            }
            // Strip HTML tags and decode common entities
            var text = Regex.Replace(html, "<[^>]+>", " ")
            text = text
                .Replace("&amp;", "&")
                .Replace("&lt;", "<")
                .Replace("&gt;", ">")
                .Replace("&quot;", "\"")
                .Replace("&#39;", "'")
                .Replace("&nbsp;", " ")
            // Collapse whitespace
            text = Regex.Replace(text, "\\s+", " ").Trim()
            return text
        }
    }

    prop CoverImagePath string? {
        get {
            let path = book.CoverImageFile
            if !string.IsNullOrEmpty(path) && File.Exists(path) {
                return path
            }
            return nil
        }
    }

    prop HasDetails bool -> true
}
