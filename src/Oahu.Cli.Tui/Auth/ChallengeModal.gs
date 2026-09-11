package Oahu.Cli.Tui.Auth

import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Tokens
import Oahu.Cli.Tui.Widgets
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic

/// Generic challenge modal for MFA, CVF, CAPTCHA, and approval challenges.
class ChallengeModal : Oahu.Cli.Tui.Shell.IModal[string] {
    private let input TextInput
    private let spinner PulseSpinner = PulseSpinner()

    prop Title string {
        get;
        init;
    }

    prop Instructions string {
        get;
        init;
    }

    prop Detail string? {
        get;
        init;
    }

    init() {
        input = TextInput{MaxLength: 64}
    }

    /// For approval challenges that only need Enter to confirm.
    prop ApprovalOnly bool {
        get;
        init;
    }

    prop IsComplete bool {
        get;
        private set;
    }

    prop WasCancelled bool {
        get;
        private set;
    }

    prop Result string? {
        get;
        private set;
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        switch key.Key {
            case ConsoleKey.Escape {
                WasCancelled = true
                IsComplete = true
                this.input.Text = string.Empty
                return true
            }
            case ConsoleKey.Enter {
                if ApprovalOnly {
                    Result = string.Empty
                    IsComplete = true
                    return true
                }
                let text = input.Text.Trim()
                if text.Length > 0 {
                    Result = text
                    IsComplete = true
                    // Clear the underlying input buffer so the secret doesn't
                    // sit in memory longer than necessary. The Result string
                    // is consumed promptly by the caller.
                    this.input.Text = string.Empty
                    return true
                }
                return true
            }
            default {
                let _ = 0
            }
        }
        if !ApprovalOnly {
            return input.HandleKey(key)
        }
        return false
    }

    func Render(width int32, height int32) IRenderable {
        let lines = List[IRenderable]()
        // Heading: PulseSpinner (Phase 6 — design doc §16.3 / §845) signalling
        // that we are awaiting a broker callback; pairs with the title verb.
        let spinnerMarkup = spinner.RenderMarkup()
        lines.Add(Markup("$spinnerMarkup [${Tokens.TextPrimary.Value.ToMarkup()} bold]${Markup.Escape(Title)}[/]"))
        lines.Add(Markup(string.Empty))
        lines.Add(Markup("[${Tokens.TextSecondary.Value.ToMarkup()}]${Markup.Escape(Instructions)}[/]"))
        if Detail != nil {
            lines.Add(Markup("[${Tokens.TextTertiary.Value.ToMarkup()}]${Markup.Escape(Detail!!)}[/]"))
        }
        lines.Add(Markup(string.Empty))
        if !ApprovalOnly {
            lines.Add(input.Render())
            lines.Add(Markup(string.Empty))
        }
        let bar = HintBar().Add(
            "Enter",
            if ApprovalOnly {
                "confirm"
            } else {
                "submit"
            }
        )
            .Add("Esc", "cancel")
        lines.Add(bar.Render())
        return Padder(Rows(lines)).Padding(4, 1, 4, 1)
    }
}
