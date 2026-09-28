using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Widgets;

/// <summary>
/// The top tab strip. Renders a single horizontal row of
/// <c>1 Home  2 Library  3 Queue …</c> with the active tab painted in the
/// <c>Selected</c> token.
/// </summary>
public sealed class TabStrip
{
    public required IReadOnlyList<string> Titles { get; init; }

    public required int ActiveIndex { get; init; }

    public bool UseAscii { get; init; }

    public IRenderable Render() => new Markup(RenderMarkup());

    public string RenderMarkup()
    {
        var sb = new StringBuilder();
        for (var i = 0; i < Titles.Count; i++)
        {
            var num = (i + 1).ToString(CultureInfo.InvariantCulture);
            var label = num + " " + Titles[i].ToLowerInvariant();
            if (i > 0)
            {
                sb.Append(' ');
            }

            if (i == ActiveIndex)
            {
                if (Tokens.Tokens.HasBackdrop)
                {
                    sb.Append('[')
                      .Append(Tokens.Tokens.Canvas.Value.ToMarkup())
                      .Append(" on ")
                      .Append(Tokens.Tokens.Selected.Value.ToMarkup())
                      .Append(" bold]");
                }
                else
                {
                    sb.Append("[invert bold]");
                }
                sb
                  .Append(' ').Append(Markup.Escape(label)).Append(' ')
                  .Append("[/]");
            }
            else
            {
                sb.Append('[').Append(Tokens.Tokens.TextTertiary.Value.ToMarkup())
                  .Append("] ").Append(Markup.Escape(num)).Append("[/] [")
                  .Append(Tokens.Tokens.TextSecondary.Value.ToMarkup()).Append(']')
                  .Append(Markup.Escape(Titles[i].ToLowerInvariant())).Append(" [/]");
            }
        }
        return sb.ToString();
    }

    public void Write(IAnsiConsole console)
    {
        ArgumentNullException.ThrowIfNull(console);
        console.Write(Render());
        console.WriteLine();
    }

    public int HitTest(int x)
    {
        if (x < 0)
        {
            return -1;
        }

        var position = 0;
        for (var i = 0; i < Titles.Count; i++)
        {
            if (i > 0)
            {
                position++;
            }
            var numberLength = (i + 1).ToString(CultureInfo.InvariantCulture).Length;
            var entryWidth = 1 + numberLength + 1 + Titles[i].Length + 1;
            if (x >= position && x < position + entryWidth)
            {
                return i;
            }
            position += entryWidth;
        }

        return -1;
    }
}
