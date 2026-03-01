using System.ComponentModel;
using System.Linq;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Threading;
using Oahu.Core.UI.Avalonia.ViewModels;

namespace Oahu.Core.UI.Avalonia.Views
{
  public partial class BookLibraryView : UserControl
  {
    private bool sortingSubscribed;
    private bool restoringSortState;

    public BookLibraryView()
    {
      InitializeComponent();
    }

    protected override void OnLoaded(RoutedEventArgs e)
    {
      base.OnLoaded(e);

      if (booksGrid is null)
      {
        return;
      }

      if (!sortingSubscribed)
      {
        booksGrid.Sorting += OnBooksGridSorting;
        sortingSubscribed = true;
      }

      // Restore previously saved sort state
      RestoreSortState();

      // Restore previously selected book
      RestoreSelectedBook();
    }

    protected override void OnUnloaded(RoutedEventArgs e)
    {
      if (DataContext is BookLibraryViewModel vm && booksGrid?.SelectedItem is BookItemViewModel selected)
      {
        vm.SelectedBookAsin = selected.Asin;
        vm.SelectedBook = selected;
      }

      if (booksGrid is not null && sortingSubscribed)
      {
        booksGrid.Sorting -= OnBooksGridSorting;
        sortingSubscribed = false;
      }

      base.OnUnloaded(e);
    }

    private void OnBooksGridSorting(object sender, DataGridColumnEventArgs args)
    {
      if (restoringSortState)
      {
        return;
      }

      if (DataContext is not BookLibraryViewModel vm || args.Column is null)
      {
        return;
      }

      int colIdx = booksGrid.Columns.IndexOf(args.Column);
      ListSortDirection next;
      if (vm.SortColumnIndex == colIdx && vm.SortDirection == ListSortDirection.Ascending)
      {
        next = ListSortDirection.Descending;
      }
      else
      {
        next = ListSortDirection.Ascending;
      }

      vm.SortColumnIndex = colIdx;
      vm.SortDirection = next;
    }

    private void RestoreSortState()
    {
      if (DataContext is not BookLibraryViewModel vm)
      {
        return;
      }

      if (vm.SortColumnIndex is null || vm.SortDirection is null)
      {
        return;
      }

      int idx = vm.SortColumnIndex.Value;
      if (idx < 0 || idx >= booksGrid.Columns.Count)
      {
        return;
      }

      var col = booksGrid.Columns[idx];

      // Clear any existing sort indicators
      foreach (var c in booksGrid.Columns)
      {
        c.ClearSort();
      }

      restoringSortState = true;
      try
      {
        col.Sort(vm.SortDirection.Value);
      }
      finally
      {
        restoringSortState = false;
      }
    }

    private void RestoreSelectedBook()
    {
      if (DataContext is not BookLibraryViewModel vm)
      {
        return;
      }

      var selected = !string.IsNullOrWhiteSpace(vm.SelectedBookAsin)
        ? vm.Books.FirstOrDefault(b => b.Asin == vm.SelectedBookAsin)
        : vm.SelectedBook;

      if (selected is null)
      {
        return;
      }

      vm.SelectedBook = selected;
      booksGrid.SelectedItem = selected;
      EnsureSelectedBookInView(selected);
    }

    private void EnsureSelectedBookInView(BookItemViewModel selected)
    {
      booksGrid.Focus();
      booksGrid.ScrollIntoView(selected, null);

      Dispatcher.UIThread.Post(() =>
      {
        booksGrid.UpdateLayout();
        booksGrid.ScrollIntoView(selected, null);

        Dispatcher.UIThread.Post(() => booksGrid.ScrollIntoView(selected, null), DispatcherPriority.Background);
      }, DispatcherPriority.Render);
    }
  }
}
