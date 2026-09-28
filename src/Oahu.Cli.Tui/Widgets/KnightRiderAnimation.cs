using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

public enum KnightRiderStyle
{
    Blocks,
    Diamonds,
}

public readonly record struct AlphaColor(Color Color, double Alpha)
{
    public static AlphaColor Opaque(Color color) => new(color, 1d);
}

public sealed class KnightRiderAnimation
{
    private static readonly AlphaColor[] DefaultTrail =
    [
        AlphaColor.Opaque(new Color(0xff, 0x00, 0x00)),
        AlphaColor.Opaque(new Color(0xff, 0x55, 0x55)),
        AlphaColor.Opaque(new Color(0xdd, 0x00, 0x00)),
        AlphaColor.Opaque(new Color(0xaa, 0x00, 0x00)),
        AlphaColor.Opaque(new Color(0x77, 0x00, 0x00)),
        AlphaColor.Opaque(new Color(0x44, 0x00, 0x00)),
    ];
    private static readonly AlphaColor DefaultInactive =
        AlphaColor.Opaque(new Color(0x33, 0x00, 0x00));
    private static readonly char[] DiamondShapes = ['⬥', '◆', '⬩', '⬪'];

    private readonly int width;
    private readonly KnightRiderStyle style;
    private readonly int holdStart;
    private readonly int holdEnd;
    private readonly AlphaColor[] trail;
    private readonly AlphaColor inactive;
    private readonly bool enableFading;
    private readonly double minAlpha;

    public KnightRiderAnimation(
        int width = 8,
        KnightRiderStyle style = KnightRiderStyle.Blocks,
        int holdStart = 30,
        int holdEnd = 9,
        IReadOnlyList<AlphaColor>? colors = null,
        AlphaColor? defaultColor = null,
        bool enableFading = true,
        double minAlpha = 0d)
    {
        this.width = Math.Max(1, width);
        this.style = style;
        this.holdStart = Math.Max(0, holdStart);
        this.holdEnd = Math.Max(0, holdEnd);
        trail = colors is { Count: > 0 } ? colors.ToArray() : DefaultTrail;
        inactive = defaultColor ?? DefaultInactive;
        this.enableFading = enableFading;
        this.minAlpha = Math.Clamp(minAlpha, 0d, 1d);
        TotalFrames = this.width + this.holdEnd + (this.width - 1) + this.holdStart;
    }

    public int TotalFrames { get; }

    public IRenderable Render(int frameIndex, Color background) =>
        new Markup(RenderMarkup(frameIndex, background));

    public string RenderMarkup(int frameIndex, Color background)
    {
        var frame = ((frameIndex % TotalFrames) + TotalFrames) % TotalFrames;
        var state = GetScannerState(frame);
        var fade = ComputeFade(state);
        var builder = new StringBuilder();
        for (var characterIndex = 0; characterIndex < width; characterIndex++)
        {
            var colorIndex = CalculateColorIndex(characterIndex, state);
            char glyph;
            Color color;
            if (colorIndex >= 0 && colorIndex < trail.Length)
            {
                var dot = trail[colorIndex];
                color = Blend(dot.Color, background, dot.Alpha);
                glyph = style == KnightRiderStyle.Diamonds
                    ? DiamondShapes[Math.Min(colorIndex, DiamondShapes.Length - 1)]
                    : '■';
            }
            else
            {
                color = Blend(inactive.Color, background, inactive.Alpha * fade);
                glyph = style == KnightRiderStyle.Diamonds ? '·' : '⬝';
            }
            builder.Append('[').Append(color.ToMarkup()).Append(']').Append(glyph).Append("[/]");
        }
        return builder.ToString();
    }

    public static AlphaColor[] DeriveTrailColors(Color brightColor, int steps = 6)
    {
        var colors = new AlphaColor[Math.Max(1, steps)];
        for (var i = 0; i < colors.Length; i++)
        {
            double alpha;
            double brightness;
            if (i == 0)
            {
                alpha = 1d;
                brightness = 1d;
            }
            else if (i == 1)
            {
                alpha = 0.9d;
                brightness = 1.15d;
            }
            else
            {
                alpha = Math.Pow(0.65d, i - 1);
                brightness = 1d;
            }
            colors[i] = new AlphaColor(Scale(brightColor, brightness), alpha);
        }
        return colors;
    }

    public static AlphaColor DeriveInactiveColor(Color brightColor, double factor = 0.2d) =>
        new(brightColor, Math.Clamp(factor, 0d, 1d));

    private readonly record struct ScannerState(
        int ActivePosition,
        bool IsHolding,
        int HoldProgress,
        int HoldTotal,
        int MovementProgress,
        int MovementTotal,
        bool IsMovingForward);

    private ScannerState GetScannerState(int frameIndex)
    {
        var forwardFrames = width;
        var backwardFrames = width - 1;
        if (frameIndex < forwardFrames)
        {
            return new(frameIndex, false, 0, 0, frameIndex, forwardFrames, true);
        }
        if (frameIndex < forwardFrames + holdEnd)
        {
            return new(width - 1, true, frameIndex - forwardFrames, holdEnd, 0, 0, true);
        }
        if (frameIndex < forwardFrames + holdEnd + backwardFrames)
        {
            var backwardIndex = frameIndex - forwardFrames - holdEnd;
            return new(width - 2 - backwardIndex, false, 0, 0, backwardIndex, backwardFrames, false);
        }
        return new(0, true, frameIndex - forwardFrames - holdEnd - backwardFrames, holdStart, 0, 0, false);
    }

    private int CalculateColorIndex(int characterIndex, ScannerState state)
    {
        var directionalDistance = state.IsMovingForward
            ? state.ActivePosition - characterIndex
            : characterIndex - state.ActivePosition;
        if (state.IsHolding)
        {
            return directionalDistance + state.HoldProgress;
        }
        if (directionalDistance > 0 && directionalDistance < trail.Length)
        {
            return directionalDistance;
        }
        return directionalDistance == 0 ? 0 : -1;
    }

    private double ComputeFade(ScannerState state)
    {
        if (!enableFading)
        {
            return 1d;
        }
        if (state.IsHolding && state.HoldTotal > 0)
        {
            var progress = Math.Min((double)state.HoldProgress / state.HoldTotal, 1d);
            return Math.Max(minAlpha, 1d - (progress * (1d - minAlpha)));
        }
        if (!state.IsHolding && state.MovementTotal > 0)
        {
            var progress = Math.Min(
                (double)state.MovementProgress / Math.Max(1, state.MovementTotal - 1),
                1d);
            return minAlpha + (progress * (1d - minAlpha));
        }
        return 1d;
    }

    private static Color Scale(Color color, double factor) => new(
        (byte)Math.Min(255d, color.R * factor),
        (byte)Math.Min(255d, color.G * factor),
        (byte)Math.Min(255d, color.B * factor));

    private static Color Blend(Color foreground, Color background, double alpha)
    {
        var clamped = Math.Clamp(alpha, 0d, 1d);
        return new Color(
            (byte)((foreground.R * clamped) + (background.R * (1d - clamped))),
            (byte)((foreground.G * clamped) + (background.G * (1d - clamped))),
            (byte)((foreground.B * clamped) + (background.B * (1d - clamped))));
    }
}
