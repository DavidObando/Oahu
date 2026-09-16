package Oahu.Cli.Tui.Tokens

import Oahu.Cli.Tui.Themes

/// The single set of semantic tokens every widget reads from. Components consume tokens,
/// never raw (cref:Spectre.Console.Color) values — that way swapping the theme (Mono /
/// HighContrast / Default) recolours the whole UI in one place.
///
/// The properties forward to (cref:Theme.Current) at read time so callers always see
/// the live theme without needing to subscribe to change events.
class Tokens {
    shared {
        prop TextPrimary SemanticColor -> Theme.Current.TextPrimary
        prop TextSecondary SemanticColor -> Theme.Current.TextSecondary
        prop TextTertiary SemanticColor -> Theme.Current.TextTertiary
        prop StatusInfo SemanticColor -> Theme.Current.StatusInfo
        prop StatusSuccess SemanticColor -> Theme.Current.StatusSuccess
        prop StatusWarning SemanticColor -> Theme.Current.StatusWarning
        prop StatusError SemanticColor -> Theme.Current.StatusError
        prop Brand SemanticColor -> Theme.Current.Brand
        prop Selected SemanticColor -> Theme.Current.Selected
        prop BorderNeutral SemanticColor -> Theme.Current.BorderNeutral
        prop BackgroundSecondary SemanticColor -> Theme.Current.BackgroundSecondary
        prop Canvas SemanticColor -> Theme.Current.Canvas
        prop CellBackground SemanticColor -> Theme.Current.CellBackground
        prop InputBackground SemanticColor -> Theme.Current.InputBackground
        prop DiffAdd SemanticColor -> Theme.Current.DiffAdd
        prop DiffRemove SemanticColor -> Theme.Current.DiffRemove

        /// True when the current theme paints surface backgrounds (false for Mono).
        prop HasBackdrop bool -> Theme.Current.Canvas.Value != Spectre.Console.Color.Default
    }
}
