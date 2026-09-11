package Oahu.Cli.Tui.Auth

import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Tokens
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Diagnostics
import System.Text

/// External-login modal: shows the Audible login URL and waits for the
/// user to paste the redirect URL. Per design TUI-exploration §10.2.b.
class ExternalLoginModal : Oahu.Cli.Tui.Shell.IModal[Uri] {
    private let loginUri Uri
    private let redirectInput TextInput = TextInput{Label: "Paste redirect URL:", MaxLength: 2048}
    private var statusMessage string?

    init(loginUri Uri) {
        this.loginUri = loginUri ?? throw ArgumentNullException("loginUri")
    }

    prop IsComplete bool {
        get;
        private set;
    }

    prop WasCancelled bool {
        get;
        private set;
    }

    prop Result Uri? {
        get;
        private set;
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        switch key.Key {
            case ConsoleKey.Escape {
                WasCancelled = true
                IsComplete = true
                return true
            }
            case ConsoleKey.Enter {
                let text = redirectInput.Text.Trim()
                if Uri.TryCreate(text, UriKind.Absolute, out var uri) {
                    Result = uri
                    IsComplete = true
                    return true
                }
                statusMessage = if string.IsNullOrEmpty(text) {
                    "Please paste the redirect URL first."
                } else {
                    "Not a valid URL. Try again."
                }
                return true
            }
            case ConsoleKey.B when(key.Modifiers & ConsoleModifiers.Control) == 0 {
                // 'b' opens browser
                if redirectInput.Text.Length == 0 {
                    TryOpenBrowser(loginUri)
                    statusMessage = "✓ Opened in browser"
                    return true
                }
                return redirectInput.HandleKey(key)
            }
            case ConsoleKey.Y when(key.Modifiers & ConsoleModifiers.Control) == 0 {
                if redirectInput.Text.Length == 0 {
                    TryCopyToClipboard(loginUri.ToString())
                    statusMessage = "✓ URL copied to clipboard"
                    return true
                }
                return redirectInput.HandleKey(key)
            }
            default {
                let _ = 0
            }
        }
        return redirectInput.HandleKey(key)
    }

    func Render(width int32, height int32) IRenderable {
        let lines = List[IRenderable]()
        lines.Add(Markup("[${Tokens.TextPrimary.Value.ToMarkup()} bold]Sign in via browser[/]"))
        lines.Add(Markup(string.Empty))
        lines.Add(Markup("[${Tokens.TextSecondary.Value.ToMarkup()}]1. Open this URL in your browser:[/]"))
        lines.Add(Markup(string.Empty))
        // Truncate long URLs for display
        let urlStr = loginUri.ToString()
        let displayUrl = if urlStr.Length > 80 {
            urlStr[.. 77] + "…"
        } else {
            urlStr
        }
        lines.Add(Markup("   [${Tokens.StatusInfo.Value.ToMarkup()}]${Markup.Escape(displayUrl)}[/]"))
        lines.Add(Markup(string.Empty))
        lines.Add(Markup("   [${Tokens.TextTertiary.Value.ToMarkup()}]b open browser · y copy URL[/]"))
        lines.Add(Markup(string.Empty))
        if statusMessage != nil {
            lines.Add(Markup("   [${Tokens.StatusSuccess.Value.ToMarkup()}]${Markup.Escape(statusMessage!!)}[/]"))
            lines.Add(Markup(string.Empty))
        }
        lines.Add(
            Markup(
                "[${Tokens.TextSecondary.Value.ToMarkup()}]2. After signing in, paste the final URL your browser ended up on:[/]"
            )
        )
        lines.Add(Markup(string.Empty))
        lines.Add(redirectInput.Render())
        lines.Add(Markup(string.Empty))
        let bar = HintBar().Add("Enter", "submit").Add("b", "open browser").Add("y", "copy URL").Add("Esc", "cancel")
        lines.Add(bar.Render())
        return Padder(Rows(lines)).Padding(4, 1, 4, 1)
    }

    shared {
        private func TryOpenBrowser(uri Uri) {
            try {
                Process.Start(ProcessStartInfo(uri.ToString()){UseShellExecute = true})
            } catch {
                // Ignore — user can copy manually.

            }
        }

        private func TryCopyToClipboard(text string) {
            try {
                // OSC 52 clipboard sequence (works in iTerm2, Windows Terminal, Kitty, modern xterm).
                let b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(text))
                Console.Write("\u001B]52;c;$b64\u001B\\")
            } catch {
                // ignore

            }
        }
    }
}
