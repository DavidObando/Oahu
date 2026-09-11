package Oahu.Cli.Tui.Tokens

import Spectre.Console

/// A single semantic colour token: a Spectre (cref:Color) wrapped in a strong type
/// so widgets compose with intent (`StatusError`) rather than raw colour (`Red`).
/// @remarks The type is implicitly convertible to (cref:Color) and to a Spectre (cref:Style)
/// so it can be used wherever Spectre expects either.
data struct SemanticColor(Value Color) {
    func operator implicit(c SemanticColor) Color -> c.Value

    func operator implicit(c SemanticColor) Style -> Style(c.Value)

    /// Returns a Spectre markup-fragment opening tag for this colour, e.g. `[red]`.
    func MarkupOpen() string -> "[${Value.ToMarkup()}]"

    func ToString() string -> Value.ToMarkup()
}
