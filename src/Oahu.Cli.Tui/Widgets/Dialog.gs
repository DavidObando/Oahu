package Oahu.Cli.Tui.Widgets

import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System

/// Centred bordered modal: title bar, body, optional (cref:HintBar) footer.
/// Renders to an (cref:IRenderable) (a Spectre (cref:Panel)) so it
/// composes inside any (cref:Layout).
class Dialog {
    prop Title string {
        get;
        init;
    }

    prop Body IRenderable {
        get;
        init;
    }

    prop Footer HintBar? {
        get;
        init;
    }

    prop UseAscii bool {
        get;
        init;
    }

    func Render() IRenderable {
        var inner = Body
        if Footer != nil {
            let rows = Rows(Body, Markup(string.Empty), Footer!!.Render())
            inner = rows
        }
        let panel = Panel(inner){
            Border = if UseAscii {
                BoxBorder.Ascii
            } else {
                BoxBorder.Rounded
            },
            Header = PanelHeader("[${Tokens.TextPrimary.Value.ToMarkup()}] ${Markup.Escape(Title)} [/]"),
            Padding = Padding(2, 1, 2, 1),
            BorderStyle = Style(Tokens.BorderNeutral)
        }
        return panel
    }

    func Write(console IAnsiConsole) {
        ArgumentNullException.ThrowIfNull(console)
        console.Write(Render())
    }
}
