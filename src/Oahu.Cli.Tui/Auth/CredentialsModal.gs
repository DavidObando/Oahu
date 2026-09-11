package Oahu.Cli.Tui.Auth

import Oahu.Cli.App.Auth
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Tokens
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic

/// Email + password modal for in-process Audible sign-in. Mirrors the GUI's
/// "direct login" step (Avalonia `ProfileWizardViewModel`): the user
/// enters their Amazon/Audible credentials, then any 2FA / CAPTCHA challenge
/// is handled by the broker via (cref:ChallengeModal).
class CredentialsModal : Oahu.Cli.Tui.Shell.IModal[AuthCredentials] {
    private let emailInput TextInput = TextInput{Label: "Email:   ", MaxLength: 320}
    private let passwordInput TextInput = TextInput{Label: "Password:", MaxLength: 256, Masked: true}
    private let regionLabel string?
    private var focus int32
    private var statusMessage string?

    init(regionLabel string? = nil) {
        this.regionLabel = regionLabel
    }

    prop IsComplete bool {
        get;
        private set;
    }

    prop WasCancelled bool {
        get;
        private set;
    }

    prop Result AuthCredentials? {
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
            case ConsoleKey.Tab {
                // With only two fields, Tab and Shift+Tab both toggle.
                focus = (focus + 1) % 2
                return true
            }
            case ConsoleKey.UpArrow {
                focus = 0
                return true
            }
            case ConsoleKey.DownArrow {
                focus = 1
                return true
            }
            case ConsoleKey.Enter {
                let email = emailInput.Text.Trim()
                let password = passwordInput.Text
                if string.IsNullOrEmpty(email) {
                    statusMessage = "Email is required."
                    focus = 0
                    return true
                }
                if string.IsNullOrEmpty(password) {
                    statusMessage = "Password is required."
                    focus = 1
                    return true
                }
                Result = AuthCredentials(email, password)
                IsComplete = true
                return true
            }
            default {
                // Forward to the focused input.
                return if focus == 0 {
                    emailInput.HandleKey(key)
                } else {
                    passwordInput.HandleKey(key)
                }
            }
        }
    }

    func Render(width int32, height int32) IRenderable {
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let error = Tokens.StatusError.Value.ToMarkup()
        let heading = if string.IsNullOrEmpty(regionLabel) {
            "Sign in to Audible"
        } else {
            "Sign in to Audible ($regionLabel)"
        }
        let lines = List[IRenderable]{
            Markup("[$primary bold]${Markup.Escape(heading)}[/]"),
            Markup(string.Empty),
            Markup("[$secondary]Enter your Amazon / Audible account credentials.[/]"),
            Markup("[$tertiary]2FA, CAPTCHA, and verification codes (if required) are prompted next.[/]"),
            Markup(string.Empty),
            emailInput.Render(focused: focus == 0),
            Markup(string.Empty),
            passwordInput.Render(focused: focus == 1),
            Markup(string.Empty)
        }
        if statusMessage != nil {
            lines.Add(Markup("[$error]${Markup.Escape(statusMessage!!)}[/]"))
            lines.Add(Markup(string.Empty))
        }
        let bar = HintBar().Add("Enter", "submit").Add("Tab/↑↓", "next field").Add("Esc", "cancel")
        lines.Add(bar.Render())
        return Padder(Rows(lines)).Padding(4, 1, 4, 1)
    }
}
