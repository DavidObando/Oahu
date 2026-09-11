package Oahu.Cli.Tui.Shell

import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Text

/// Basic single-line text input with cursor. Handles printable characters,
/// Backspace, Delete, Home, End, Left, Right. Renders as a Spectre
/// (cref:IRenderable).
class TextInput {
    init() {
        Label = string.Empty
        MaxLength = 256
    }

    private let buffer StringBuilder = StringBuilder()
    private var cursor int32

    prop Label string {
        get;
        init;
    }

    prop Masked bool {
        get;
        init;
    }

    prop MaxLength int32 {
        get;
        init;
    }

    prop Text string {
        get -> buffer.ToString()
        set {
            buffer.Clear()
            buffer.Append(value ?? string.Empty)
            cursor = buffer.Length
        }
    }

    prop Cursor int32 -> cursor

    /// Process a key press. Returns true if the key was consumed.
    func HandleKey(key ConsoleKeyInfo) bool {
        switch key.Key {
            case ConsoleKey.Backspace {
                if cursor > 0 {
                    buffer.Remove(cursor - 1, 1)
                    cursor--
                }
                return true
            }
            case ConsoleKey.Delete {
                if cursor < buffer.Length {
                    buffer.Remove(cursor, 1)
                }
                return true
            }
            case ConsoleKey.LeftArrow {
                if cursor > 0 {
                    cursor--
                }
                return true
            }
            case ConsoleKey.RightArrow {
                if cursor < buffer.Length {
                    cursor++
                }
                return true
            }
            case ConsoleKey.Home {
                cursor = 0
                return true
            }
            case ConsoleKey.End {
                cursor = buffer.Length
                return true
            }
            default {
                if key.KeyChar >= ' ' && !char.IsControl(key.KeyChar) && buffer.Length < MaxLength {
                    buffer.Insert(cursor, key.KeyChar)
                    cursor++
                    return true
                }
                return false
            }
        }
    }

    /// Render the input field as an (cref:IRenderable).
    func Render(focused bool = true) IRenderable {
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        let display = if Masked {
            String('•', buffer.Length)
        } else {
            buffer.ToString()
        }
        let sb = StringBuilder()
        if !string.IsNullOrEmpty(Label) {
            sb.Append("[$secondary]${Markup.Escape(Label)}[/]").Append("  ")
        }
        if focused && cursor <= display.Length {
            let before = display[.. cursor]
            let cursorChar = if cursor < display.Length {
                display[cursor].ToString()
            } else {
                " "
            }
            let after = if cursor < display.Length {
                display[(cursor + 1) ..]
            } else {
                string.Empty
            }
            sb.Append("[$primary]${Markup.Escape(before)}[/]")
            sb.Append("[$brand underline]${Markup.Escape(cursorChar)}[/]")
            sb.Append("[$primary]${Markup.Escape(after)}[/]")
        } else {
            sb.Append("[$primary]${Markup.Escape(display)}[/]")
        }
        return Markup(sb.ToString())
    }
}
