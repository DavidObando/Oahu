package Oahu.Cli.Tui.Icons

import Oahu.Cli.Tui.Tokens
import System

/// Single-width Unicode glyphs paired with ASCII fallbacks for hostile terminals.
///
/// Every icon ships:
/// • (cref:Glyph) — the Unicode form, single-cell guaranteed.
/// • (cref:AsciiFallback) — emitted when ASCII mode is forced.
/// • (cref:Color) — the semantic colour to render with.
/// • (cref:ScreenReaderLabel) — what to announce when a screen reader is active.
data struct Icon(Glyph string, AsciiFallback string, Color SemanticColor, ScreenReaderLabel string) {
    /// Returns the right glyph for the current rendering mode (ASCII forced or not).
    func Render(useAscii bool) string -> if useAscii {
        AsciiFallback
    } else {
        Glyph
    }
}

/// The icon set referenced by every widget.
class Icons {
    shared {
        prop Success Icon -> Icon("✓", "+", Tokens.StatusSuccess, "Success")
        prop Error Icon -> Icon("✗", "X", Tokens.StatusError, "Error")
        prop Warning Icon -> Icon("!", "!", Tokens.StatusWarning, "Warning")
        prop Info Icon -> Icon("·", ".", Tokens.StatusInfo, "Info")
        prop Disabled Icon -> Icon("⊘", "-", Tokens.TextTertiary, "Disabled")
        prop Prompt Icon -> Icon("❯", ">", Tokens.Brand, "Prompt")
        prop Filled Icon -> Icon("●", "*", Tokens.TextPrimary, "Filled")

        /// Single binary "in-flight" glyph for rows with their own phase bars (§6.6.1, §16).
        prop Working Icon -> Icon("◐", "*", Tokens.StatusInfo, "Working")

        prop Empty Icon -> Icon("○", "o", Tokens.TextTertiary, "Empty")
        prop ArrowRight Icon -> Icon("→", "->", Tokens.TextSecondary, "Arrow right")
        prop ArrowUp Icon -> Icon("↑", "^", Tokens.TextSecondary, "Arrow up")
        prop ArrowDown Icon -> Icon("↓", "v", Tokens.TextSecondary, "Arrow down")

        /// True when the runtime forces ASCII glyphs (env override or hostile terminal).
        prop ForceAscii bool -> string.Equals(
            Environment.GetEnvironmentVariable("OAHU_ASCII_ICONS"),
            "1",
            StringComparison.Ordinal
        ) ||
            string.Equals(Environment.GetEnvironmentVariable("TERM"), "dumb", StringComparison.OrdinalIgnoreCase)
    }
}
