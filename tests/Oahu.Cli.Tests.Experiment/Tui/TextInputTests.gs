// G# port of Tui/TextInputTests.cs — FULL for 0.1.459.
//
// All 9 tests ported. Init-only properties (MaxLength, Label, Masked)
// now set via object initializer syntax.

package Oahu.Cli.Tests.Experiment.Tui

import System
import Oahu.Cli.Tui.Shell
import Xunit

type TextInputTests class {
    func Key(ch char, k ConsoleKey) ConsoleKeyInfo {
        return ConsoleKeyInfo(ch, k, false, false, false)
    }

    @Fact
    func Typing_Appends_Characters() {
        var input = TextInput()
        input.HandleKey(Key('h', ConsoleKey.NoName))
        input.HandleKey(Key('i', ConsoleKey.NoName))
        Assert.Equal("hi", input.Text)
        Assert.Equal(2, input.Cursor)
    }

    @Fact
    func Backspace_Deletes_Before_Cursor() {
        var input = TextInput()
        input.Text = "abc"
        input.HandleKey(Key(char(8), ConsoleKey.Backspace))
        Assert.Equal("ab", input.Text)
        Assert.Equal(2, input.Cursor)
    }

    @Fact
    func Delete_Removes_At_Cursor() {
        var input = TextInput()
        input.Text = "abc"
        input.HandleKey(Key(char(0), ConsoleKey.Home))
        Assert.Equal(0, input.Cursor)
        input.HandleKey(Key(char(0), ConsoleKey.Delete))
        Assert.Equal("bc", input.Text)
    }

    @Fact
    func Left_Right_Move_Cursor() {
        var input = TextInput()
        input.Text = "ab"
        Assert.Equal(2, input.Cursor)
        input.HandleKey(Key(char(0), ConsoleKey.LeftArrow))
        Assert.Equal(1, input.Cursor)
        input.HandleKey(Key(char(0), ConsoleKey.RightArrow))
        Assert.Equal(2, input.Cursor)
    }

    @Fact
    func Home_End_Jump() {
        var input = TextInput()
        input.Text = "hello"
        input.HandleKey(Key(char(0), ConsoleKey.Home))
        Assert.Equal(0, input.Cursor)
        input.HandleKey(Key(char(0), ConsoleKey.End))
        Assert.Equal(5, input.Cursor)
    }

    @Fact
    func MaxLength_Prevents_Overflow() {
        var input = TextInput() { MaxLength = 3 }
        input.HandleKey(Key('a', ConsoleKey.NoName))
        input.HandleKey(Key('b', ConsoleKey.NoName))
        input.HandleKey(Key('c', ConsoleKey.NoName))
        input.HandleKey(Key('d', ConsoleKey.NoName))
        Assert.Equal("abc", input.Text)
    }

    @Fact
    func Set_Text_Resets_Cursor() {
        var input = TextInput()
        input.HandleKey(Key('x', ConsoleKey.NoName))
        input.Text = "new"
        Assert.Equal("new", input.Text)
        Assert.Equal(3, input.Cursor)
    }

    @Fact
    func Render_Returns_Renderable() {
        var input = TextInput() { Label = "Name:" }
        input.Text = "test"
        var r = input.Render()
        Assert.NotNull(r)
    }

    @Fact
    func Masked_Mode_Hides_Text() {
        var input = TextInput() { Masked = true }
        input.Text = "secret"
        var r = input.Render()
        Assert.NotNull(r)
    }
}
