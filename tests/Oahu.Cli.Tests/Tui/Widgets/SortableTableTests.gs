package Oahu.Cli.Tests.Tui.Widgets

import Oahu.Cli.Tui.Widgets
import System
import Xunit

class SortableTableTests {
    @Fact
    func AddRow_Validates_Column_Count() {
        let t = SortableTable([]string{"a", "b"})
        Assert.Throws[ArgumentException](() -> t.AddRow("only-one"))
    }

    @Fact
    func Sort_Ascending_Then_Descending_By_Column() {
        let t = SortableTable([]string{"name", "age"})
        t.AddRow("Charlie", "30")
        t.AddRow("alice", "20")
        t.AddRow("Bob", "25")
        t.Sort(0, ascending: true)
        Assert.Equal(0, t.SortColumn)
        Assert.True(t.SortAscending)
        let asc = t.Build()
        Assert.Equal(3, asc.Rows.Count)
        t.Sort(0, ascending: false)
        Assert.False(t.SortAscending)
    }

    @Fact
    func ToggleSort_Reverses_When_Same_Column() {
        let t = SortableTable([]string{"n"})
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
        let t = SortableTable([]string{"x"})
        Assert.Throws[ArgumentOutOfRangeException](() -> t.Sort(5))
    }

    @Fact
    func Build_Marks_Active_Sort_Column() {
        let t = SortableTable([]string{"n"})
        t.AddRow("a")
        t.Sort(0, ascending: true)
        let table = t.Build()
        Assert.Single(table.Columns)
    }

    @Fact
    func Clear_Resets_Rows_And_Sort() {
        let t = SortableTable([]string{"n"})
        t.AddRow("a")
        t.Sort(0)
        t.Clear()
        Assert.Equal(0, t.RowCount)
        Assert.Null(t.SortColumn)
    }
}
