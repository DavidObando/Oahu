package Oahu.Cli.Tui.Hooks

/// Three responsive breakpoints used across the design system, per
/// `docs/OAHU_CLI_DESIGN_TUI_EXPLORATION.md` §1.
enum BreakpointKind {
    Compact,
    Narrow,
    Wide
}

/// Maps a width to a (cref:BreakpointKind).
class Breakpoint {
    shared {
        const CompactMax int32 = 79
        const NarrowMax int32 = 119
        func For(width int32) BreakpointKind -> if width <= CompactMax {
            BreakpointKind.Compact
        } else {
            (
                if width <= NarrowMax {
                    BreakpointKind.Narrow
                } else {
                    BreakpointKind.Wide
                }
            )
        }

        func For(size TerminalSize) BreakpointKind -> For(size.Width)
    }
}
