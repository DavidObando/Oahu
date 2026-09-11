package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Tokens
import Spectre.Console
import System

/// Thin wrapper over Spectre's (cref:Table) that defaults to the design
/// system's borders, header style, and column-overflow policy. Use this instead
/// of constructing a (cref:Table) directly so a future theme change picks
/// up tables for free.
class StyledTable {
    shared {
        func Create(useAscii bool = false) Table {
            let t = Table{
                Border: if useAscii {
                    TableBorder.Ascii
                } else {
                    TableBorder.Rounded
                },
                BorderStyle: Style(Tokens.BorderNeutral),
                ShowRowSeparators: false,
                Expand: false
            }
            return t
        }
    }
}

/// Add a column whose header uses the primary text token in bold.
func (table Table) AddBoldColumn(header string, noWrap bool = false) Table {
    ArgumentNullException.ThrowIfNull(table)
    let col = TableColumn("[bold ${Tokens.TextPrimary.Value.ToMarkup()}]${Markup.Escape(header)}[/]")
    if noWrap {
        col.NoWrap()
    }
    table.AddColumn(col)
    return table
}
