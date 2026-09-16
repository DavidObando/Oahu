package Oahu.Cli.Tui.Widgets

import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Linq
import System.Text

/// Glyph set used to render the scanner's dots.
enum KnightRiderStyle {
    Blocks,
    Diamonds
}

/// An RGB color paired with an alpha (0-1) used for terminal-side blending.
data struct AlphaColor(Color Color, Alpha float64) {
    shared {
        func Opaque(color Color) AlphaColor -> AlphaColor(color, 1.0d)
    }
}

/// Port of the OpenCode TUI "Knight Rider" scanner spinner (via the G# REPL).
/// The original renders true RGBA over a GPU-composited terminal; Spectre.Console cells
/// have no alpha channel, so (cref:RenderMarkup) blends each dot's alpha against a
/// caller-supplied background color once per frame instead.
class KnightRiderAnimation {
    private let width int32
    private let style KnightRiderStyle
    private let holdStart int32
    private let holdEnd int32
    private let trail[]AlphaColor
    private let inactive AlphaColor
    private let enableFading bool
    private let minAlpha float64

    init(
        width int32 = 8,
        style KnightRiderStyle = KnightRiderStyle.Blocks,
        holdStart int32 = 30,
        holdEnd int32 = 9,
        colors IReadOnlyList[AlphaColor]? = nil,
        defaultColor AlphaColor? = nil,
        enableFading bool = true,
        minAlpha float64 = 0d
    ) {
        this.width = Math.Max(1, width)
        this.style = style
        this.holdStart = Math.Max(0, holdStart)
        this.holdEnd = Math.Max(0, holdEnd)
        trail = if colors != nil && colors.Count > 0 {
            System.Linq.Enumerable.ToArray(colors)
        } else {
            DefaultTrail
        }
        inactive = defaultColor ?? DefaultInactive
        this.enableFading = enableFading
        this.minAlpha = Math.Clamp(minAlpha, 0d, 1d)
        // Bidirectional cycle: forward (width) + hold-end + backward (width-1) + hold-start.
        TotalFrames = this.width + this.holdEnd + (this.width - 1) + this.holdStart
    }

    /// Total frames in one full sweep (there and back), including hold pauses.
    prop TotalFrames int32 {
        get;
        private set;
    }

    /// Renders one animation frame as a single line of colored glyphs, blended against
    /// [`background`](paramref). [`frameIndex`](paramref) wraps modulo (cref:TotalFrames),
    /// so callers can pass an ever-incrementing tick counter.
    func Render(frameIndex int32, background Color) IRenderable -> Markup(RenderMarkup(frameIndex, background))

    /// Same as (cref:Render), but returns the raw markup string for composing into a larger line.
    func RenderMarkup(frameIndex int32, background Color) string {
        let frame = ((frameIndex % TotalFrames) + TotalFrames) % TotalFrames
        let state = GetScannerState(frame)
        let fade = ComputeFade(state)
        let sb = StringBuilder()
        for var charIndex = 0; charIndex < width; charIndex++ {
            let colorIndex = CalculateColorIndex(charIndex, state)
            var glyph char
            var color Color
            if colorIndex >= 0 && colorIndex < trail.Length {
                let dot = trail[colorIndex]
                color = Blend(dot.Color, background, dot.Alpha)
                glyph = if style == KnightRiderStyle.Diamonds {
                    DiamondShapes[Math.Min(colorIndex, DiamondShapes.Length - 1)]
                } else {
                    '■'
                }
            } else {
                color = Blend(inactive.Color, background, inactive.Alpha * fade)
                glyph = if style == KnightRiderStyle.Diamonds {
                    '·'
                } else {
                    '⬝'
                }
            }
            sb.Append('[').Append(color.ToMarkup()).Append(']').Append(glyph).Append("[/]")
        }
        return sb.ToString()
    }

    /// Bidirectional scanner state at a given frame: where the head is, and whether it's holding at an end.
    private data struct ScannerState(
        ActivePosition int32,
        IsHolding bool,
        HoldProgress int32,
        HoldTotal int32,
        MovementProgress int32,
        MovementTotal int32,
        IsMovingForward bool
    )

    private func GetScannerState(frameIndex int32) ScannerState {
        let forwardFrames = width
        let backwardFrames = width - 1
        if frameIndex < forwardFrames {
            return ScannerState(frameIndex, false, 0, 0, frameIndex, forwardFrames, true)
        }
        if frameIndex < forwardFrames + holdEnd {
            return ScannerState(width - 1, true, frameIndex - forwardFrames, holdEnd, 0, 0, true)
        }
        if frameIndex < forwardFrames + holdEnd + backwardFrames {
            let backwardIndex = frameIndex - forwardFrames - holdEnd
            return ScannerState(width - 2 - backwardIndex, false, 0, 0, backwardIndex, backwardFrames, false)
        }
        return ScannerState(0, true, frameIndex - forwardFrames - holdEnd - backwardFrames, holdStart, 0, 0, false)
    }

    private func CalculateColorIndex(charIndex int32, state ScannerState) int32 {
        let directionalDistance = if state.IsMovingForward {
            state.ActivePosition - charIndex
        } else {
            charIndex - state.ActivePosition
        }
        if state.IsHolding {
            return directionalDistance + state.HoldProgress
        }
        if directionalDistance > 0 && directionalDistance < trail.Length {
            return directionalDistance
        }
        if directionalDistance == 0 {
            return 0
        }
        return -1
    }

    private func ComputeFade(state ScannerState) float64 {
        if !enableFading {
            return 1.0d
        }
        if state.IsHolding && state.HoldTotal > 0 {
            let progress = Math.Min(float64(state.HoldProgress) / float64(state.HoldTotal), 1d)
            return Math.Max(minAlpha, 1d - (progress * (1d - minAlpha)))
        }
        if !state.IsHolding && state.MovementTotal > 0 {
            let progress = Math.Min(float64(state.MovementProgress) / float64(Math.Max(1, state.MovementTotal - 1)), 1d)
            return minAlpha + (progress * (1d - minAlpha))
        }
        return 1.0d
    }

    shared {
        private let DefaultTrail[]AlphaColor = []AlphaColor{
            AlphaColor.Opaque(Color(0xff, 0x00, 0x00)),
            AlphaColor.Opaque(Color(0xff, 0x55, 0x55)),
            AlphaColor.Opaque(Color(0xdd, 0x00, 0x00)),
            AlphaColor.Opaque(Color(0xaa, 0x00, 0x00)),
            AlphaColor.Opaque(Color(0x77, 0x00, 0x00)),
            AlphaColor.Opaque(Color(0x44, 0x00, 0x00))
        }

        private let DefaultInactive AlphaColor = AlphaColor.Opaque(Color(0x33, 0x00, 0x00))

        private let DiamondShapes[]char = []char{'⬥', '◆', '⬩', '⬪'}

        /// Derives a fading trail of alpha colors from a single bright color: full
        /// brightness at the head, a slight bloom on the second dot, then exponential
        /// alpha decay behind it.
        func DeriveTrailColors(brightColor Color, steps int32 = 6)[]AlphaColor {
            let colors = [Math.Max(1, steps)]AlphaColor
            for var i = 0; i < colors.Length; i++ {
                var alpha float64
                var brightness float64
                if i == 0 {
                    alpha = 1.0d
                    brightness = 1.0d
                } else if i == 1 {
                    alpha = 0.9d
                    brightness = 1.15d
                } else {
                    alpha = Math.Pow(0.65d, float64(i - 1))
                    brightness = 1.0d
                }
                colors[i] = AlphaColor(Scale(brightColor, brightness), alpha)
            }
            return colors
        }

        /// Derives the inactive/off-dot color from a bright color via alpha.
        func DeriveInactiveColor(brightColor Color, factor float64 = 0.2d) AlphaColor -> AlphaColor(
            brightColor,
            Math.Clamp(factor, 0d, 1d)
        )

        private func Scale(c Color, factor float64) Color -> Color(
            uint8(Math.Min(255d, float64(c.R) * factor)),
            uint8(Math.Min(255d, float64(c.G) * factor)),
            uint8(Math.Min(255d, float64(c.B) * factor))
        )

        private func Blend(fg Color, bg Color, alpha float64) Color {
            let a = Math.Clamp(alpha, 0d, 1d)
            return Color(
                uint8((float64(fg.R) * a) + (float64(bg.R) * (1d - a))),
                uint8((float64(fg.G) * a) + (float64(bg.G) * (1d - a))),
                uint8((float64(fg.B) * a) + (float64(bg.B) * (1d - a)))
            )
        }
    }
}
