package Oahu.Cli.Tui.Widgets

import Spectre.Console
import System
import System.Collections.Generic
import System.Linq

/// Lightweight Spectre (cref:Table) wrapper that supports re-sorting in
/// place by a column index. The widget owns no rendering state — callers grab
/// (cref:Build) when they need a fresh (cref:Table) to render.
/// @remarks Sort is stable: equal-keyed rows preserve their original input order.
/// Comparison is ordinal/case-insensitive on the string projection of the cell;
/// callers that need numeric sort should pre-pad with leading zeros or supply a
/// custom (cref:Comparison{T}) via (cref:Sort(int, bool, Comparison{string}?)).
class SortableTable {
    private let headers List[string]
    private let rows List[[]string]
    private var sortColumn int32 = -1
    private var sortAscending bool = true

    init(headers IEnumerable[string]) {
        ArgumentNullException.ThrowIfNull(headers)
        this.headers = headers.ToList()
        this.rows = List[[]string]()
    }

    prop RowCount int32 -> rows.Count
    prop ColumnCount int32 -> headers.Count
    prop SortColumn int32? -> if sortColumn < 0 {
        nil
    } else {
        sortColumn
    }
    prop SortAscending bool -> sortAscending

    func AddRow(cells ...string) {
        ArgumentNullException.ThrowIfNull(cells)
        if cells.Length != headers.Count {
            throw ArgumentException("Row has ${cells.Length} cells but the table expects ${headers.Count}.", "cells")
        }
        rows.Add(cells)
    }

    func Clear() {
        rows.Clear()
        sortColumn = -1
        sortAscending = true
    }

    /// Sort rows by [`columnIndex`](paramref) in place.
    func Sort(columnIndex int32, ascending bool = true, comparer Comparison[string]? = nil) {
        if columnIndex < 0 || columnIndex >= headers.Count {
            throw ArgumentOutOfRangeException("columnIndex")
        }
        let cmp = comparer ?? ((a string, b string) -> string.Compare(a, b, StringComparison.OrdinalIgnoreCase))
        rows.Sort(
            (l[]string, r[]string) -> if ascending {
                cmp(l[columnIndex], r[columnIndex])
            } else {
                cmp(r[columnIndex], l[columnIndex])
            }
        )
        sortColumn = columnIndex
        sortAscending = ascending
    }

    /// Toggle the sort direction if [`columnIndex`](paramref) is already
    /// the active sort column; otherwise sort ascending by that column.
    func ToggleSort(columnIndex int32) {
        if columnIndex == sortColumn {
            Sort(columnIndex, !sortAscending)
        } else {
            Sort(columnIndex, ascending: true)
        }
    }

    /// Build a fresh Spectre (cref:Table) with the current header + row state.
    func Build() Table {
        let t = Table()
        for var i = 0;
        i < headers.Count;
        i++ {
            let marker = if i == sortColumn {
                (
                    if sortAscending {
                        " ▲"
                    } else {
                        " ▼"
                    }
                )
            } else {
                string.Empty
            }
            t.AddColumn(headers[i] + marker)
        }
        for row in rows {
            t.AddRow(row)
        }
        return t
    }
}
