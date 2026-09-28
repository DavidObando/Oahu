using System;
using System.Collections.Generic;
using Oahu.Cli.Tui.Tokens;
using Spectre.Console;

namespace Oahu.Cli.Tui.Themes;

public sealed class Theme
{
    private static Theme _current = Themes.Default;

    public static Theme Current
    {
        get => _current;
        private set => _current = value;
    }

    public static IReadOnlyList<Theme> Available { get; } =
    [
        Themes.Default,
        Themes.Sunset,
        Themes.Sand,
        Themes.Mono,
        Themes.HighContrast,
        Themes.Colorblind,
    ];

    public required string Name { get; init; }
    public required SemanticColor TextPrimary { get; init; }
    public required SemanticColor TextSecondary { get; init; }
    public required SemanticColor TextTertiary { get; init; }
    public required SemanticColor StatusInfo { get; init; }
    public required SemanticColor StatusSuccess { get; init; }
    public required SemanticColor StatusWarning { get; init; }
    public required SemanticColor StatusError { get; init; }
    public required SemanticColor Brand { get; init; }
    public required SemanticColor Selected { get; init; }
    public required SemanticColor BorderNeutral { get; init; }
    public required SemanticColor BackgroundSecondary { get; init; }
    public required SemanticColor Canvas { get; init; }
    public required SemanticColor CellBackground { get; init; }
    public required SemanticColor InputBackground { get; init; }
    public required SemanticColor DiffAdd { get; init; }
    public required SemanticColor DiffRemove { get; init; }

    public static void Cycle()
    {
        for (var i = 0; i < Available.Count; i++)
        {
            if (ReferenceEquals(Available[i], Current))
            {
                Current = Available[(i + 1) % Available.Count];
                return;
            }
        }
        Current = Available[0];
    }

    public static void Use(string name)
    {
        foreach (var theme in Available)
        {
            if (string.Equals(theme.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                Current = theme;
                return;
            }
        }
        throw new ArgumentException(
            $"Unknown theme '{name}'. Known: {string.Join(", ", AvailableNames())}.",
            nameof(name));
    }

    public static void Reset() => Current = Themes.Default;

    public static IEnumerable<string> AvailableNames()
    {
        foreach (var theme in Available)
        {
            yield return theme.Name;
        }
    }
}

public static class Themes
{
    public static Theme Default { get; } = new()
    {
        Name = "Default",
        TextPrimary = new(new Color(232, 242, 244)),
        TextSecondary = new(new Color(175, 201, 209)),
        TextTertiary = new(new Color(105, 136, 148)),
        StatusInfo = new(new Color(79, 195, 247)),
        StatusSuccess = new(new Color(87, 217, 130)),
        StatusWarning = new(new Color(245, 197, 66)),
        StatusError = new(new Color(248, 113, 113)),
        Brand = new(new Color(53, 208, 186)),
        Selected = new(new Color(53, 208, 186)),
        BorderNeutral = new(new Color(58, 88, 100)),
        BackgroundSecondary = new(new Color(26, 45, 56)),
        Canvas = new(new Color(8, 18, 24)),
        CellBackground = new(new Color(15, 32, 41)),
        InputBackground = new(new Color(23, 48, 60)),
        DiffAdd = new(new Color(87, 217, 130)),
        DiffRemove = new(new Color(248, 113, 113)),
    };

    public static Theme Sunset { get; } = new()
    {
        Name = "Sunset",
        TextPrimary = new(new Color(246, 232, 224)),
        TextSecondary = new(new Color(217, 184, 172)),
        TextTertiary = new(new Color(150, 116, 110)),
        StatusInfo = new(new Color(242, 166, 90)),
        StatusSuccess = new(new Color(123, 216, 143)),
        StatusWarning = new(new Color(255, 201, 77)),
        StatusError = new(new Color(255, 107, 107)),
        Brand = new(new Color(255, 138, 92)),
        Selected = new(new Color(255, 138, 92)),
        BorderNeutral = new(new Color(94, 62, 72)),
        BackgroundSecondary = new(new Color(46, 27, 40)),
        Canvas = new(new Color(20, 10, 18)),
        CellBackground = new(new Color(33, 18, 29)),
        InputBackground = new(new Color(51, 32, 44)),
        DiffAdd = new(new Color(123, 216, 143)),
        DiffRemove = new(new Color(255, 107, 107)),
    };

    public static Theme Sand { get; } = new()
    {
        Name = "Sand",
        TextPrimary = new(new Color(58, 46, 34)),
        TextSecondary = new(new Color(92, 76, 58)),
        TextTertiary = new(new Color(138, 120, 96)),
        StatusInfo = new(new Color(18, 115, 166)),
        StatusSuccess = new(new Color(46, 125, 50)),
        StatusWarning = new(new Color(178, 106, 0)),
        StatusError = new(new Color(198, 40, 40)),
        Brand = new(new Color(14, 124, 123)),
        Selected = new(new Color(14, 124, 123)),
        BorderNeutral = new(new Color(183, 169, 140)),
        BackgroundSecondary = new(new Color(234, 224, 200)),
        Canvas = new(new Color(237, 228, 206)),
        CellBackground = new(new Color(247, 241, 227)),
        InputBackground = new(new Color(231, 220, 194)),
        DiffAdd = new(new Color(46, 125, 50)),
        DiffRemove = new(new Color(198, 40, 40)),
    };

    public static Theme Mono { get; } = Monochrome("Mono");

    public static Theme HighContrast { get; } = new()
    {
        Name = "HighContrast",
        TextPrimary = new(Color.White),
        TextSecondary = new(Color.White),
        TextTertiary = new(Color.Silver),
        StatusInfo = new(Color.Aqua),
        StatusSuccess = new(Color.Lime),
        StatusWarning = new(Color.Yellow),
        StatusError = new(Color.Red),
        Brand = new(Color.Aqua),
        Selected = new(Color.Yellow),
        BorderNeutral = new(Color.White),
        BackgroundSecondary = new(Color.Black),
        Canvas = new(Color.Black),
        CellBackground = new(Color.Black),
        InputBackground = new(Color.Black),
        DiffAdd = new(Color.Lime),
        DiffRemove = new(Color.Red),
    };

    public static Theme Colorblind { get; } = new()
    {
        Name = "Colorblind",
        TextPrimary = new(Color.White),
        TextSecondary = new(Color.Grey85),
        TextTertiary = new(Color.Grey50),
        StatusInfo = new(Color.SkyBlue1),
        StatusSuccess = new(Color.MediumSpringGreen),
        StatusWarning = new(Color.Orange1),
        StatusError = new(Color.IndianRed1),
        Brand = new(Color.MediumPurple1),
        Selected = new(Color.Yellow),
        BorderNeutral = new(Color.Grey50),
        BackgroundSecondary = new(Color.Grey15),
        Canvas = new(new Color(8, 18, 24)),
        CellBackground = new(new Color(15, 32, 41)),
        InputBackground = new(new Color(23, 48, 60)),
        DiffAdd = new(Color.SkyBlue1),
        DiffRemove = new(Color.Orange1),
    };

    private static Theme Monochrome(string name) => new()
    {
        Name = name,
        TextPrimary = new(Color.Default),
        TextSecondary = new(Color.Default),
        TextTertiary = new(Color.Default),
        StatusInfo = new(Color.Default),
        StatusSuccess = new(Color.Default),
        StatusWarning = new(Color.Default),
        StatusError = new(Color.Default),
        Brand = new(Color.Default),
        Selected = new(Color.Default),
        BorderNeutral = new(Color.Default),
        BackgroundSecondary = new(Color.Default),
        Canvas = new(Color.Default),
        CellBackground = new(Color.Default),
        InputBackground = new(Color.Default),
        DiffAdd = new(Color.Default),
        DiffRemove = new(Color.Default),
    };
}
