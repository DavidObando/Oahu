package Oahu.Cli.Output

import System
import System.Collections
import System.Collections.Generic
import System.IO
import System.Linq
import System.Text

/// Tab-separated, no escapes, no colour, no Unicode borders.
/// Suitable for piping into awk/cut/jq-without-jq workflows.
class PlainOutputWriter : IOutputWriter {
    private let writer TextWriter

    init(context OutputContext, writer TextWriter) {
        Context = context
        this.writer = writer
    }

    prop Context OutputContext {
        get;
        init;
    }

    func WriteResource(resourceName string, data IReadOnlyDictionary[string, object?]) {
        SafeWrite(
            () -> {
                for kv in data {
                    writer.Write(kv.Key)
                    writer.Write('\t')
                    writer.WriteLine(Format(kv.Value))
                }
            }
        )
    }

    func WriteCollection(
        resourceName string,
        rows IReadOnlyList[IReadOnlyDictionary[string, object?]],
        columns IReadOnlyList[OutputColumn]
    ) {
        SafeWrite(
            () -> {
                // Header row.
                writer.WriteLine(string.Join('\t', columns.Select((c OutputColumn) -> Escape(c.Header))))
                for row in rows {
                    writer.WriteLine(
                        string.Join(
                            '\t',
                            columns.Select(
                                (c OutputColumn) -> Format(
                                    if row.TryGetValue(c.Key, out var v) {
                                        v
                                    } else {
                                        default(object?)
                                    }
                                )
                            )
                        )
                    )
                }
            }
        )
    }

    func WriteMessage(message string) {
        if Context.Quiet {
            return
        }
        SafeWrite(() -> Console.Error.WriteLine(message))
    }

    func WriteSuccess(message string) {
        if Context.Quiet {
            return
        }
        SafeWrite(() -> Console.Error.WriteLine(message))
    }

    shared {
        private func SafeWrite(action() -> void) {
            try {
                action()
            } catch (IOException) {
                // Broken pipe (downstream `head`, `less`, etc. closed) — exit gracefully.

            } catch (ObjectDisposedException) {
                // Output stream torn down by host.

            }
        }

        private func Escape(s string) string {
            if string.IsNullOrEmpty(s) {
                return string.Empty
            }
            if s.IndexOfAny([]char{'\\', '\t', '\n', '\r'}) < 0 {
                return s
            }
            let sb = StringBuilder(s.Length + 4)
            for ch in s {
                switch ch {
                    case '\\' {
                        sb.Append("\\\\")
                    }
                    case '\t' {
                        sb.Append("\\t")
                    }
                    case '\n' {
                        sb.Append("\\n")
                    }
                    case '\r' {
                        sb.Append("\\r")
                    }
                    default {
                        sb.Append(ch)
                    }
                }
            }
            return sb.ToString()
        }

        private func Format(value object?) string -> switch value {
            case nil: string.Empty
            case b is bool: if b {
                "true"
            } else {
                "false"
            }
            case dto is DateTimeOffset: dto.ToString("O")
            case dt is DateTime: dt.ToString("O")
            case seq is IEnumerable when !(value is string): string.Join(",", seq.Cast[object?]().Select(Format))
            default: Escape(value!!.ToString() ?? string.Empty)
        }
    }
}
