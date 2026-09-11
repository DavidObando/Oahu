package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System

/// The single "thinking" spinner used across the TUI for opaque waits.
///
/// Per `OAHU_CLI_DESIGN_TUI_EXPLORATION.md §16.3`:
/// - Frame set `● ◉ ◎ ○`, all single-width, identical width. Replacing the spinner with a `✓` / `✗` on
/// completion must not shift any column.
/// - Always paired with a verb and an Esc hint by the surrounding widget (e.g. (cref:StatusLine)); the
/// spinner alone is decoration.
/// - Cadence: ~12 FPS in the alt-screen TUI loop, ~6 FPS for inline renders (the AppShell render loop
/// is the cadence source — this widget just advances one frame per (cref:Render) call).
/// - Disabled (replaced by a static `*` in ASCII) when `useAscii` is set or the host is not a TTY /
/// NO_COLOR.
/// (cref:PulseSpinner) is intentionally stateful: each instance owns
/// a frame counter that auto-increments per (cref:Render) call so
/// callers can simply embed it into their layout and re-render to animate.
/// Use (cref:Tick) to manually advance when rendering through a
/// pre-built (cref:IRenderable).
class PulseSpinner {
    private var frame int32

    /// If true, render as a static `*` (ASCII-safe).
    prop UseAscii bool {
        get;
        init;
    }

    /// Optional override of the colour token.
    prop ColorMarkup string? {
        get;
        init;
    }

    /// The current single-width glyph (for embedding inline).
    prop Glyph string -> if UseAscii {
        "*"
    } else {
        Frames[frame % Frames.Length].ToString()
    }

    /// Advance one frame without rendering.
    func Tick() -> frame = (frame + 1) % Frames.Length

    /// Render the current frame and advance. The result is a single-width
    /// markup string sized to fit alongside text without column shift.
    func Render() IRenderable {
        let color = ColorMarkup ?? Tokens.Brand.Value.ToMarkup()
        let glyph = Glyph
        Tick()
        return Markup("[$color]${Markup.Escape(glyph)}[/]")
    }

    /// Render to a markup-only string (advances the frame).
    func RenderMarkup() string {
        let color = ColorMarkup ?? Tokens.Brand.Value.ToMarkup()
        let glyph = Glyph
        Tick()
        return "[$color]${Markup.Escape(glyph)}[/]"
    }

    shared {
        private let Frames[]char = []char{'●', '◉', '◎', '○', '◎', '◉'}
    }
}
