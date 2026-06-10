// G# port of Tui/Widgets/SortableTableTests.cs — IMPROVED for 0.1.516.
//
// Tests SortableTable: column-count validation, sort ascending/descending,
// toggle-sort reversal, out-of-range exception, Build output, and Clear.
//
// Added: Direct Assert.Equal / Assert.Null on int? SortColumn (gsharp#504/#517 fixed).
//
// LIMITATIONS:
// - table.Columns.Count doesn't bind (IReadOnlyList member, known limitation).
//   Workaround: Linq .Count() extension.
// - Constructor takes IEnumerable<string>: pass List[string].

package Oahu.Cli.Tests.Experiment.Tui.Widgets

import System
import System.Collections.Generic
import System.Linq
import Oahu.Cli.Tui.Widgets
import Xunit

type SortableTableTests class {
    @Fact
    func AddRow_Validates_Column_Count() {
        var headers = List[string]()
        headers.Add("a")
        headers.Add("b")
        var t = SortableTable(headers)
        Assert.Throws[ArgumentException](func() {
            t.AddRow("only-one")
        })
    }

    @Fact
    func Sort_Ascending_Then_Descending_By_Column() {
        var headers = List[string]()
        headers.Add("name")
        headers.Add("age")
        var t = SortableTable(headers)
        t.AddRow("Charlie", "30")
        t.AddRow("alice", "20")
        t.AddRow("Bob", "25")
        t.Sort(0, true)
        Assert.Equal(0, t.SortColumn)
        Assert.True(t.SortAscending)
        var asc = t.Build()
        Assert.Equal(3, asc.Rows.Count)

        t.Sort(0, false)
        Assert.False(t.SortAscending)
    }

    @Fact
    func ToggleSort_Reverses_When_Same_Column() {
        var headers = List[string]()
        headers.Add("n")
        var t = SortableTable(headers)
        t.AddRow("a")
        t.AddRow("b")
        t.ToggleSort(0)
        Assert.True(t.SortAscending)
        t.ToggleSort(0)
        Assert.False(t.SortAscending)
        t.ToggleSort(0)
        Assert.True(t.SortAscending)
    }

    @Fact
    func Sort_Out_Of_Range_Throws() {
        var headers = List[string]()
        headers.Add("x")
        var t = SortableTable(headers)
        Assert.Throws[ArgumentOutOfRangeException](func() {
            t.Sort(5, true)
        })
    }

    @Fact
    func Build_Marks_Active_Sort_Column() {
        var headers = List[string]()
        headers.Add("n")
        var t = SortableTable(headers)
        t.AddRow("a")
        t.Sort(0, true)
        var table = t.Build()
        Assert.Equal(1, table.Columns.Count())
    }

    @Fact
    func Clear_Resets_Rows_And_Sort() {
        var headers = List[string]()
        headers.Add("n")
        var t = SortableTable(headers)
        t.AddRow("a")
        t.Sort(0, true)
        t.Clear()
        Assert.Equal(0, t.RowCount)
        Assert.Null(t.SortColumn)
    }
}
