// G# port of Tui/TextInputTests.cs.
//
// Tests the TextInput widget key handling: typing, backspace, delete,
// cursor movement (left/right/home/end), and Text property assignment.
//
// LIMITATIONS:
// - MaxLength, Label, and Masked are init-only properties; tests that
//   set them are dropped (MissingMethodException at runtime).

package Oahu.Cli.Tests.Experiment.Tui

import System
import Oahu.Cli.Tui.Shell
import Xunit

type TextInputTests class {
    @Fact
    func Typing_Appends_Characters() {
        var input = TextInput()
        input.HandleKey(ConsoleKeyInfo('h', ConsoleKey.NoName, false, false, false))
        input.HandleKey(ConsoleKeyInfo('i', ConsoleKey.NoName, false, false, false))
        Assert.Equal("hi", input.Text)
        Assert.Equal(2, input.Cursor)
    }

    @Fact
    func Backspace_Deletes_Before_Cursor() {
        var input = TextInput()
        input.Text = "abc"
        input.HandleKey(ConsoleKeyInfo(char(8), ConsoleKey.Backspace, false, false, false))
        Assert.Equal("ab", input.Text)
        Assert.Equal(2, input.Cursor)
    }

    @Fact
    func Delete_Removes_At_Cursor() {
        var input = TextInput()
        input.Text = "abc"
        input.HandleKey(ConsoleKeyInfo(char(0), ConsoleKey.Home, false, false, false))
        Assert.Equal(0, input.Cursor)
        input.HandleKey(ConsoleKeyInfo(char(0), ConsoleKey.Delete, false, false, false))
        Assert.Equal("bc", input.Text)
    }

    @Fact
    func Left_Right_Move_Cursor() {
        var input = TextInput()
        input.Text = "ab"
        Assert.Equal(2, input.Cursor)
        input.HandleKey(ConsoleKeyInfo(char(0), ConsoleKey.LeftArrow, false, false, false))
        Assert.Equal(1, input.Cursor)
        input.HandleKey(ConsoleKeyInfo(char(0), ConsoleKey.RightArrow, false, false, false))
        Assert.Equal(2, input.Cursor)
    }

    @Fact
    func Home_End_Jump() {
        var input = TextInput()
        input.Text = "hello"
        input.HandleKey(ConsoleKeyInfo(char(0), ConsoleKey.Home, false, false, false))
        Assert.Equal(0, input.Cursor)
        input.HandleKey(ConsoleKeyInfo(char(0), ConsoleKey.End, false, false, false))
        Assert.Equal(5, input.Cursor)
    }

    // LIMITATION: MaxLength is init-only; MaxLength_Prevents_Overflow dropped.
    // LIMITATION: Label is init-only; Render_Returns_Renderable dropped.
    // LIMITATION: Masked is init-only; Masked_Mode_Hides_Text dropped.

    @Fact
    func Set_Text_Resets_Cursor() {
        var input = TextInput()
        input.HandleKey(ConsoleKeyInfo('x', ConsoleKey.NoName, false, false, false))
        input.Text = "new"
        Assert.Equal("new", input.Text)
        Assert.Equal(3, input.Cursor)
    }
}
