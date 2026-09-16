package Oahu.Cli.Commands

import Oahu.Cli
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Paths
import Spectre.Console
import System
import System.Text

/// Pure rendering of a (cref:DoctorReport) in pretty / JSON formats.
/// Separated from (cref:DoctorCommand) so it can be unit-tested without
/// going through System.CommandLine.
class DoctorRender {
    shared {
        func Pretty(report DoctorReport, globals GlobalOptions) {
            let console = SpectreConsoleFactory.Create(globals)
            let table = Table()
                .Border(
                if globals.UseAscii {
                    TableBorder.Ascii
                } else {
                    TableBorder.Rounded
                }
            )
                .AddColumn(TableColumn("[bold]Status[/]").NoWrap())
                .AddColumn(TableColumn("[bold]Check[/]"))
                .AddColumn(TableColumn("[bold]Detail[/]"))
            for c in report.Checks {
                let (icon, colour) = switch c.Severity {
                    case DoctorSeverity.Ok: (
                        if globals.UseAscii {
                            "OK "
                        } else {
                            "✓"
                        },
                        "green"
                    )
                    case DoctorSeverity.Warning: (
                        if globals.UseAscii {
                            "WARN"
                        } else {
                            "!"
                        },
                        "yellow"
                    )
                    case DoctorSeverity.Error: (
                        if globals.UseAscii {
                            "FAIL"
                        } else {
                            "✗"
                        },
                        "red"
                    )
                    default: ("?", "grey")
                }
                table.AddRow("[$colour]${Markup.Escape(icon)}[/]", Markup.Escape(c.Title), Markup.Escape(c.Message))
                if !string.IsNullOrEmpty(c.Hint) {
                    table.AddRow(string.Empty, string.Empty, "[grey]→ ${Markup.Escape(c.Hint!!)}[/]")
                }
            }
            console.Write(table)
            console.MarkupLine(string.Empty)
            console.MarkupLine("[grey]Config dir:[/] ${Markup.Escape(CliPaths.ConfigDir)}")
            console.MarkupLine("[grey]Log dir:   [/] ${Markup.Escape(CliPaths.LogDir)}")
            console.MarkupLine("[grey]User-data: [/] ${Markup.Escape(CliPaths.SharedUserDataDir)}")
            if report.HasErrors {
                console.MarkupLine(string.Empty)
                console.MarkupLine("[red]✗ doctor found errors. Fix them and re-run.[/]")
            } else if report.HasWarnings {
                console.MarkupLine(string.Empty)
                console.MarkupLine("[yellow]! doctor completed with warnings.[/]")
            } else {
                console.MarkupLine(string.Empty)
                console.MarkupLine("[green]✓ doctor: all checks passed.[/]")
            }
        }

        func Json(report DoctorReport) {
            let sb = StringBuilder()
            sb
                .Append("{\"_schemaVersion\":1,\"hasErrors\":")
                .Append(
                if report.HasErrors {
                    "true"
                } else {
                    "false"
                }
            )
                .Append(",\"hasWarnings\":")
                .Append(
                if report.HasWarnings {
                    "true"
                } else {
                    "false"
                }
            )
                .Append(",\"checks\":[")
            for var i = 0; i < report.Checks.Count; i++ {
                let c = report.Checks[i]
                if i > 0 {
                    sb.Append(',')
                }
                sb
                    .Append('{')
                    .Append("\"id\":")
                    .Append(JsonString(c.Id))
                    .Append(',')
                    .Append("\"title\":")
                    .Append(JsonString(c.Title))
                    .Append(',')
                    .Append("\"severity\":")
                    .Append(JsonString(c.Severity.ToString().ToLowerInvariant()))
                    .Append(',')
                    .Append("\"message\":")
                    .Append(JsonString(c.Message))
                if !string.IsNullOrEmpty(c.Hint) {
                    sb.Append(',').Append("\"hint\":").Append(JsonString(c.Hint!!))
                }
                sb.Append('}')
            }
            sb.Append("]}")
            CliEnvironment.Out.WriteLine(sb.ToString())
        }

        private func JsonString(s string) string {
            let sb = StringBuilder(s.Length + 2)
            sb.Append('"')
            for ch in s {
                switch ch {
                    case '"' {
                        sb.Append("\\\"")
                    }
                    case '\\' {
                        sb.Append("\\\\")
                    }
                    case '\u0008' {
                        sb.Append("\\b")
                    }
                    case '\u000C' {
                        sb.Append("\\f")
                    }
                    case '\n' {
                        sb.Append("\\n")
                    }
                    case '\r' {
                        sb.Append("\\r")
                    }
                    case '\t' {
                        sb.Append("\\t")
                    }
                    default {
                        if ch < char(0x20) {
                            sb.Append("\\u").Append((int32(ch)).ToString("X4"))
                        } else {
                            sb.Append(ch)
                        }
                    }
                }
            }
            sb.Append('"')
            return sb.ToString()
        }
    }
}
