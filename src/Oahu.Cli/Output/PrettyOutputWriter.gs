package Oahu.Cli.Output

import Spectre.Console
import System
import System.Collections
import System.Collections.Generic
import System.IO
import System.Linq

/// Spectre-rendered tables with semantic colour. Falls back gracefully when the
/// underlying console doesn't emit ANSI (Spectre handles capability detection).
class PrettyOutputWriter : IOutputWriter {
    private let console IAnsiConsole

    init(context OutputContext, console IAnsiConsole) {
        Context = context
        this.console = console
    }

    prop Context OutputContext {
        get;
        init;
    }

    func WriteResource(resourceName string, data IReadOnlyDictionary[string, object?]) {
        let grid = Grid()
        grid.AddColumn(GridColumn().NoWrap().PadRight(2))
        grid.AddColumn()
        for kv in data {
            grid.AddRow(Markup.Escape(kv.Key), Markup.Escape(Format(kv.Value)))
        }
        SafeWrite(() -> console.Write(grid))
    }

    func WriteCollection(
        resourceName string,
        rows IReadOnlyList[IReadOnlyDictionary[string, object?]],
        columns IReadOnlyList[OutputColumn]
    ) {
        if rows.Count == 0 {
            SafeWrite(() -> console.MarkupLine("[grey](no items)[/]"))
            return
        }
        let table = Table().Border(
            if Context.UseAscii {
                TableBorder.Ascii
            } else {
                TableBorder.Rounded
            }
        )
        for col in columns {
            table.AddColumn(TableColumn(Markup.Escape(col.Header)))
        }
        for row in rows {
            table.AddRow(
                columns.Select(
                    (c OutputColumn) -> Markup.Escape(
                        Format(
                            if row.TryGetValue(c.Key, out var v) {
                                v
                            } else {
                                default(object?)
                            }
                        )
                    )
                )
                    .ToArray()
            )
        }
        SafeWrite(() -> console.Write(table))
    }

    func WriteMessage(message string) {
        if Context.Quiet {
            return
        }
        SafeWrite(() -> console.WriteLine(message))
    }

    func WriteSuccess(message string) {
        if Context.Quiet {
            return
        }
        SafeWrite(() -> console.MarkupLine("[green]✓[/] ${Markup.Escape(message)}"))
    }

    shared {
        private func SafeWrite(action() -> void) {
            try {
                action()
            } catch (IOException) {
                // Broken pipe — downstream closed.

            } catch (ObjectDisposedException) {
                // Console torn down.

            }
        }

        private func Format(value object?) string -> switch value {
            case nil: string.Empty
            case b is bool: if b {
                "true"
            } else {
                "false"
            }
            case dto is DateTimeOffset: dto.ToString("yyyy-MM-dd HH:mm")
            case dt is DateTime: dt.ToString("yyyy-MM-dd HH:mm")
            case seq is IEnumerable when !(value is string): string.Join(", ", seq.Cast[object?]().Select(Format))
            default: value!!.ToString() ?? string.Empty
        }
    }
}
