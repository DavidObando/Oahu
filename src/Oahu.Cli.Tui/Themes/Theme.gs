package Oahu.Cli.Tui.Themes

import Oahu.Cli.Tui.Tokens
import Spectre.Console
import System
import System.Collections.Generic

/// A complete palette: every widget consumes (cref:Tokens.Tokens), which in turn
/// reads from (cref:Current). Switching theme is a single (cref:Use(string))
/// call — no widget needs to subscribe.
class Theme {
    prop Name string {
        get;
        init;
    }

    prop TextPrimary SemanticColor {
        get;
        init;
    }

    prop TextSecondary SemanticColor {
        get;
        init;
    }

    prop TextTertiary SemanticColor {
        get;
        init;
    }

    prop StatusInfo SemanticColor {
        get;
        init;
    }

    prop StatusSuccess SemanticColor {
        get;
        init;
    }

    prop StatusWarning SemanticColor {
        get;
        init;
    }

    prop StatusError SemanticColor {
        get;
        init;
    }

    prop Brand SemanticColor {
        get;
        init;
    }

    prop Selected SemanticColor {
        get;
        init;
    }

    prop BorderNeutral SemanticColor {
        get;
        init;
    }

    prop BackgroundSecondary SemanticColor {
        get;
        init;
    }

    /// Background for chrome/gaps between larger sections (header, footer, spacers).
    /// (cref:Spectre.Console.Color.Default) means "never paint" (Mono / NO_COLOR).
    prop Canvas SemanticColor {
        get;
        init;
    }

    /// Background for body content surfaces (list panels, detail panes).
    /// (cref:Spectre.Console.Color.Default) means "never paint" (Mono / NO_COLOR).
    prop CellBackground SemanticColor {
        get;
        init;
    }

    /// Background for focused / input surfaces (modals, palette, cursor rows).
    /// (cref:Spectre.Console.Color.Default) means "never paint" (Mono / NO_COLOR).
    prop InputBackground SemanticColor {
        get;
        init;
    }

    prop DiffAdd SemanticColor {
        get;
        init;
    }

    prop DiffRemove SemanticColor {
        get;
        init;
    }

    shared {
        private var _current Theme = Themes.Default

        prop Current Theme {
            get {
                return _current
            }
            private set {
                _current = value
            }
        }

        private let _available IReadOnlyList[Theme] = []Theme{
            Themes.Default,
            Themes.Sunset,
            Themes.Sand,
            Themes.Mono,
            Themes.HighContrast,
            Themes.Colorblind
        }

        /// Advance to the next theme in (cref:Available) (wraps around).
        /// Used by the global theme-cycle key.
        func Cycle() {
            for var i = 0; i < Available.Count; i++ {
                if object.ReferenceEquals(Available[i], Current) {
                    Current = Available[(i + 1) % Available.Count]
                    return
                }
            }
            Current = Available[0]
        }

        prop Available IReadOnlyList[Theme] {
            get {
                return _available
            }
        }

        /// Switch the active theme by name (case-insensitive).
        /// @exception ArgumentException Thrown when [`name`](paramref) matches no built-in theme.
        func Use(name string) {
            for t in Available {
                if string.Equals(t.Name, name, StringComparison.OrdinalIgnoreCase) {
                    Current = t
                    return
                }
            }
            throw ArgumentException("Unknown theme '$name'. Known: ${string.Join(", ", AvailableNames())}.", "name")
        }

        /// Reset to the (cref:Themes.Default) theme. Useful for tests.
        func Reset() -> Current = Themes.Default

        func AvailableNames() sequence[string] {
            for t in Available {
                yield t.Name
            }
        }
    }
}

/// Built-in theme palettes. Add new ones here and append to (cref:Theme.Available).
class Themes {
    shared {
        /// The flagship look: a deep "lagoon" canvas with turquoise accents —
        /// dark, warm, and unmistakably Oahu.
        private let _default Theme = Theme{
            Name: "Default",
            TextPrimary: SemanticColor(Color(232, 242, 244)),
            TextSecondary: SemanticColor(Color(175, 201, 209)),
            TextTertiary: SemanticColor(Color(105, 136, 148)),
            StatusInfo: SemanticColor(Color(79, 195, 247)),
            StatusSuccess: SemanticColor(Color(87, 217, 130)),
            StatusWarning: SemanticColor(Color(245, 197, 66)),
            StatusError: SemanticColor(Color(248, 113, 113)),
            Brand: SemanticColor(Color(53, 208, 186)),
            Selected: SemanticColor(Color(53, 208, 186)),
            BorderNeutral: SemanticColor(Color(58, 88, 100)),
            BackgroundSecondary: SemanticColor(Color(26, 45, 56)),
            Canvas: SemanticColor(Color(8, 18, 24)),
            CellBackground: SemanticColor(Color(15, 32, 41)),
            InputBackground: SemanticColor(Color(23, 48, 60)),
            DiffAdd: SemanticColor(Color(87, 217, 130)),
            DiffRemove: SemanticColor(Color(248, 113, 113))
        }

        prop Default Theme {
            get {
                return _default
            }
        }

        /// Warm dusk palette: plum canvas with coral accents.
        private let _sunset Theme = Theme{
            Name: "Sunset",
            TextPrimary: SemanticColor(Color(246, 232, 224)),
            TextSecondary: SemanticColor(Color(217, 184, 172)),
            TextTertiary: SemanticColor(Color(150, 116, 110)),
            StatusInfo: SemanticColor(Color(242, 166, 90)),
            StatusSuccess: SemanticColor(Color(123, 216, 143)),
            StatusWarning: SemanticColor(Color(255, 201, 77)),
            StatusError: SemanticColor(Color(255, 107, 107)),
            Brand: SemanticColor(Color(255, 138, 92)),
            Selected: SemanticColor(Color(255, 138, 92)),
            BorderNeutral: SemanticColor(Color(94, 62, 72)),
            BackgroundSecondary: SemanticColor(Color(46, 27, 40)),
            Canvas: SemanticColor(Color(20, 10, 18)),
            CellBackground: SemanticColor(Color(33, 18, 29)),
            InputBackground: SemanticColor(Color(51, 32, 44)),
            DiffAdd: SemanticColor(Color(123, 216, 143)),
            DiffRemove: SemanticColor(Color(255, 107, 107))
        }

        prop Sunset Theme {
            get {
                return _sunset
            }
        }

        /// Light beach palette: warm paper canvas with deep-teal accents,
        /// for light-background terminals.
        private let _sand Theme = Theme{
            Name: "Sand",
            TextPrimary: SemanticColor(Color(58, 46, 34)),
            TextSecondary: SemanticColor(Color(92, 76, 58)),
            TextTertiary: SemanticColor(Color(138, 120, 96)),
            StatusInfo: SemanticColor(Color(18, 115, 166)),
            StatusSuccess: SemanticColor(Color(46, 125, 50)),
            StatusWarning: SemanticColor(Color(178, 106, 0)),
            StatusError: SemanticColor(Color(198, 40, 40)),
            Brand: SemanticColor(Color(14, 124, 123)),
            Selected: SemanticColor(Color(14, 124, 123)),
            BorderNeutral: SemanticColor(Color(183, 169, 140)),
            BackgroundSecondary: SemanticColor(Color(234, 224, 200)),
            Canvas: SemanticColor(Color(237, 228, 206)),
            CellBackground: SemanticColor(Color(247, 241, 227)),
            InputBackground: SemanticColor(Color(231, 220, 194)),
            DiffAdd: SemanticColor(Color(46, 125, 50)),
            DiffRemove: SemanticColor(Color(198, 40, 40))
        }

        prop Sand Theme {
            get {
                return _sand
            }
        }

        /// Monochrome theme used automatically when `NO_COLOR` is set, when stdout is
        /// redirected, or when a screen reader is detected. Every token resolves to the
        /// terminal's default foreground so no ANSI colour escape is ever emitted.
        private let _mono Theme = Theme{
            Name: "Mono",
            TextPrimary: SemanticColor(Color.Default),
            TextSecondary: SemanticColor(Color.Default),
            TextTertiary: SemanticColor(Color.Default),
            StatusInfo: SemanticColor(Color.Default),
            StatusSuccess: SemanticColor(Color.Default),
            StatusWarning: SemanticColor(Color.Default),
            StatusError: SemanticColor(Color.Default),
            Brand: SemanticColor(Color.Default),
            Selected: SemanticColor(Color.Default),
            BorderNeutral: SemanticColor(Color.Default),
            BackgroundSecondary: SemanticColor(Color.Default),
            Canvas: SemanticColor(Color.Default),
            CellBackground: SemanticColor(Color.Default),
            InputBackground: SemanticColor(Color.Default),
            DiffAdd: SemanticColor(Color.Default),
            DiffRemove: SemanticColor(Color.Default)
        }

        prop Mono Theme {
            get {
                return _mono
            }
        }

        /// High-contrast theme: maximum-contrast palette suitable for low-vision users and
        /// for the accessibility audit (APCA Lc ≥ 30 for body text, per Phase 9).
        private let _highContrast Theme = Theme{
            Name: "HighContrast",
            TextPrimary: SemanticColor(Color.White),
            TextSecondary: SemanticColor(Color.White),
            TextTertiary: SemanticColor(Color.Silver),
            StatusInfo: SemanticColor(Color.Aqua),
            StatusSuccess: SemanticColor(Color.Lime),
            StatusWarning: SemanticColor(Color.Yellow),
            StatusError: SemanticColor(Color.Red),
            Brand: SemanticColor(Color.Aqua),
            Selected: SemanticColor(Color.Yellow),
            BorderNeutral: SemanticColor(Color.White),
            BackgroundSecondary: SemanticColor(Color.Black),
            Canvas: SemanticColor(Color.Black),
            CellBackground: SemanticColor(Color.Black),
            InputBackground: SemanticColor(Color.Black),
            DiffAdd: SemanticColor(Color.Lime),
            DiffRemove: SemanticColor(Color.Red)
        }

        prop HighContrast Theme {
            get {
                return _highContrast
            }
        }

        /// Colorblind-safe theme using the Okabe-Ito palette: avoids red/green
        /// pairings that the most common forms of color vision deficiency
        /// (deuteranopia, protanopia) confuse. Status semantics are conveyed by
        /// blue (info), bluish-green (success), orange/yellow (warning), and
        /// vermillion (error) — all distinguishable by deuteranopes/protanopes.
        private let _colorblind Theme = Theme{
            Name: "Colorblind",
            TextPrimary: SemanticColor(Color.White),
            TextSecondary: SemanticColor(Color.Grey85),
            TextTertiary: SemanticColor(Color.Grey50),
            StatusInfo: SemanticColor(Color.SkyBlue1),
            StatusSuccess: SemanticColor(Color.MediumSpringGreen),
            StatusWarning: SemanticColor(Color.Orange1),
            StatusError: SemanticColor(Color.IndianRed1),
            Brand: SemanticColor(Color.MediumPurple1),
            Selected: SemanticColor(Color.Yellow),
            BorderNeutral: SemanticColor(Color.Grey50),
            BackgroundSecondary: SemanticColor(Color.Grey15),
            Canvas: SemanticColor(Color(8, 18, 24)),
            CellBackground: SemanticColor(Color(15, 32, 41)),
            InputBackground: SemanticColor(Color(23, 48, 60)),
            DiffAdd: SemanticColor(Color.SkyBlue1),
            DiffRemove: SemanticColor(Color.Orange1)
        }

        prop Colorblind Theme {
            get {
                return _colorblind
            }
        }
    }
}
