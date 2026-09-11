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
            Themes.Mono,
            Themes.HighContrast,
            Themes.Colorblind
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
        private let _default Theme = Theme{
            Name: "Default",
            TextPrimary: SemanticColor(Color.White),
            TextSecondary: SemanticColor(Color.Grey85),
            TextTertiary: SemanticColor(Color.Grey50),
            StatusInfo: SemanticColor(Color.SkyBlue1),
            StatusSuccess: SemanticColor(Color.Green),
            StatusWarning: SemanticColor(Color.Yellow),
            StatusError: SemanticColor(Color.Red),
            Brand: SemanticColor(Color.Aqua),
            Selected: SemanticColor(Color.DodgerBlue1),
            BorderNeutral: SemanticColor(Color.Grey50),
            BackgroundSecondary: SemanticColor(Color.Grey15),
            DiffAdd: SemanticColor(Color.Green),
            DiffRemove: SemanticColor(Color.Red)
        }

        prop Default Theme {
            get {
                return _default
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
