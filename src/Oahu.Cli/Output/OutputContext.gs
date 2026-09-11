package Oahu.Cli.Output

import System

/// Carries the resolved output format plus enough state for handlers to write
/// pretty/plain/json without each command repeating the same logic.
class OutputContext {
    init(format OutputFormat, quiet bool, useColor bool, useAscii bool) {
        Format = format
        Quiet = quiet
        UseColor = useColor
        UseAscii = useAscii
    }

    prop Format OutputFormat {
        get;
        init;
    }

    prop Quiet bool {
        get;
        init;
    }

    prop UseColor bool {
        get;
        init;
    }

    prop UseAscii bool {
        get;
        init;
    }

    shared {
        /// Resolves the effective output format from explicit flags + TTY detection.
        /// Precedence (per design §9 / §4.2):
        /// • --json wins if both flags are set (and we surface a parse error elsewhere).
        /// • --plain forces Plain.
        /// • Otherwise: Pretty if stdout is a TTY, else Plain.
        func ResolveFormat(jsonFlag bool, plainFlag bool, stdoutIsRedirected bool) OutputFormat {
            if jsonFlag {
                return OutputFormat.Json
            }
            if plainFlag {
                return OutputFormat.Plain
            }
            return if stdoutIsRedirected {
                OutputFormat.Plain
            } else {
                OutputFormat.Pretty
            }
        }
    }
}
