package Oahu.Cli.Tests.Tui

import Oahu.Cli.Tui.Shell
import System
import Xunit

class TextInputTests {
    @Fact
    func Typing_Appends_Characters() {
        let input = TextInput()
        input.HandleKey(Key('h'))
        input.HandleKey(Key('i'))
        Assert.Equal("hi", input.Text)
        Assert.Equal(2, input.Cursor)
    }

    @Fact
    func Backspace_Deletes_Before_Cursor() {
        let input = TextInput{Text: "abc"}
        input.HandleKey(Key('\u0008', ConsoleKey.Backspace))
        Assert.Equal("ab", input.Text)
        Assert.Equal(2, input.Cursor)
    }

    @Fact
    func Delete_Removes_At_Cursor() {
        let input = TextInput{Text: "abc"}
        input.HandleKey(Key('\u0000', ConsoleKey.Home))
        Assert.Equal(0, input.Cursor)
        input.HandleKey(Key('\u0000', ConsoleKey.Delete))
        Assert.Equal("bc", input.Text)
    }

    @Fact
    func Left_Right_Move_Cursor() {
        let input = TextInput{Text: "ab"}
        Assert.Equal(2, input.Cursor)
        input.HandleKey(Key('\u0000', ConsoleKey.LeftArrow))
        Assert.Equal(1, input.Cursor)
        input.HandleKey(Key('\u0000', ConsoleKey.RightArrow))
        Assert.Equal(2, input.Cursor)
    }

    @Fact
    func Home_End_Jump() {
        let input = TextInput{Text: "hello"}
        input.HandleKey(Key('\u0000', ConsoleKey.Home))
        Assert.Equal(0, input.Cursor)
        input.HandleKey(Key('\u0000', ConsoleKey.End))
        Assert.Equal(5, input.Cursor)
    }

    @Fact
    func MaxLength_Prevents_Overflow() {
        let input = TextInput{MaxLength: 3}
        input.HandleKey(Key('a'))
        input.HandleKey(Key('b'))
        input.HandleKey(Key('c'))
        input.HandleKey(Key('d'))
        Assert.Equal("abc", input.Text)
    }

    @Fact
    func Set_Text_Resets_Cursor() {
        let input = TextInput()
        input.HandleKey(Key('x'))
        input.Text = "new"
        Assert.Equal("new", input.Text)
        Assert.Equal(3, input.Cursor)
    }

    @Fact
    func Render_Returns_Renderable() {
        let input = TextInput{Text: "test", Label: "Name:"}
        let r = input.Render()
        Assert.NotNull(r)
    }

    @Fact
    func Masked_Mode_Hides_Text() {
        let input = TextInput{Text: "secret", Masked: true}
        let r = input.Render()
        Assert.NotNull(r)
    }

    shared {
        private func Key(
            ch char,
            k ConsoleKey = ConsoleKey.NoName,
            mod ConsoleModifiers = ConsoleModifiers.None
        ) ConsoleKeyInfo -> ConsoleKeyInfo(
            ch,
            k,
            shift: (mod & ConsoleModifiers.Shift) != 0,
            alt: (mod & ConsoleModifiers.Alt) != 0,
            control: (mod & ConsoleModifiers.Control) != 0
        )
    }
}
