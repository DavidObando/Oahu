package Oahu.Core.UI.Avalonia.Views

import Avalonia.Controls
import Avalonia.Interactivity
import Avalonia.Threading
import Oahu.Core.UI.Avalonia.ViewModels
import System.ComponentModel
import System.Linq

open partial class BookLibraryView : UserControl {
    private var sortingSubscribed bool
    private var restoringSortState bool

    init() {
        InitializeComponent()
    }

    protected open override func OnLoaded(e RoutedEventArgs) {
        base.OnLoaded(e)
        if booksGrid == nil {
            return
        }
        if !sortingSubscribed {
            this.booksGrid!!.Sorting += OnBooksGridSorting
            sortingSubscribed = true
        }
        // Restore previously saved sort state
        RestoreSortState()
        // Restore previously selected book
        RestoreSelectedBook()
    }

    protected open override func OnUnloaded(e RoutedEventArgs) {
        if DataContext is BookLibraryViewModel vm && booksGrid?.SelectedItem is BookItemViewModel selected {
            vm.SelectedBookAsin = selected.Asin
            vm.SelectedBook = selected
        }
        if booksGrid != nil && sortingSubscribed {
            this.booksGrid!!.Sorting -= OnBooksGridSorting
            sortingSubscribed = false
        }
        base.OnUnloaded(e)
    }

    private func OnBooksGridSorting(sender object, args DataGridColumnEventArgs) {
        if restoringSortState {
            return
        }
        if DataContext is not BookLibraryViewModel vm || args.Column == nil {
            return
        }
        let colIdx = booksGrid!!.Columns!!.IndexOf(args.Column!!)
        var next ListSortDirection
        if vm.SortColumnIndex == colIdx && vm.SortDirection == ListSortDirection.Ascending {
            next = ListSortDirection.Descending
        } else {
            next = ListSortDirection.Ascending
        }
        vm.SortColumnIndex = colIdx
        vm.SortDirection = next
    }

    private func RestoreSortState() {
        if DataContext is not BookLibraryViewModel vm {
            return
        }
        if vm.SortColumnIndex == nil || vm.SortDirection == nil {
            return
        }
        let idx = vm.SortColumnIndex!!
        if idx < 0 || idx >= booksGrid!!.Columns!!.Count {
            return
        }
        let col = booksGrid!!.Columns!![idx]!!
        // Clear any existing sort indicators
        for c in booksGrid!!.Columns!! {
            c!!.ClearSort()
        }
        restoringSortState = true
        try {
            col.Sort(vm.SortDirection!!)
        } finally {
            restoringSortState = false
        }
    }

    private func RestoreSelectedBook() {
        if DataContext is not BookLibraryViewModel vm {
            return
        }
        let selected BookItemViewModel? = if !string.IsNullOrWhiteSpace(vm.SelectedBookAsin) {
            vm.Books.FirstOrDefault((b BookItemViewModel) -> b.Asin == vm.SelectedBookAsin)
        } else {
            vm.SelectedBook
        }
        if selected == nil {
            return
        }
        vm.SelectedBook = selected
        this.booksGrid!!.SelectedItem = selected
        EnsureSelectedBookInView(selected)
    }

    private func EnsureSelectedBookInView(selected BookItemViewModel?) {
        booksGrid!!.Focus()
        booksGrid!!.ScrollIntoView(selected, nil)
        Dispatcher.UIThread.Post(
            () -> {
                booksGrid!!.UpdateLayout()
                booksGrid!!.ScrollIntoView(selected, nil)
                Dispatcher.UIThread.Post(() -> booksGrid!!.ScrollIntoView(selected, nil), DispatcherPriority.Background)
            },
            DispatcherPriority.Render
        )
    }
}
