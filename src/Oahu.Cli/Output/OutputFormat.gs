package Oahu.Cli.Output

/// Selects how command-mode handlers serialise their results.
/// Per design §9: Pretty (TTY), Plain (non-TTY or --plain), Json (--json).
enum OutputFormat {
    Pretty,
    Plain,
    Json
}
