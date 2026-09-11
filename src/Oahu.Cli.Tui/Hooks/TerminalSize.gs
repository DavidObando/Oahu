package Oahu.Cli.Tui.Hooks

import Spectre.Console
import System

/// Reads the current terminal dimensions, exposing change events so widgets can
/// re-layout. Backed by Spectre's (cref:IAnsiConsole) when one is available;
/// falls back to (cref:Console) on plain stdout.
class TerminalSize {
    private let readWidth() -> int32
    private let readHeight() -> int32
    private var width int32
    private var height int32

    init(console IAnsiConsole? = nil) {
        if console != nil {
            readWidth = () -> console.Profile.Width
            readHeight = () -> console.Profile.Height
        } else {
            readWidth = SafeConsoleWidth
            readHeight = SafeConsoleHeight
        }
        width = readWidth()
        height = readHeight()
    }

    prop Width int32 -> width
    prop Height int32 -> height
    event Changed Action

    /// Re-read the dimensions; raises (cref:Changed) if either changed.
    func Poll() bool {
        let w = readWidth()
        let h = readHeight()
        if w == width && h == height {
            return false
        }
        width = w
        height = h
        Changed?()
        return true
    }

    shared {
        private func SafeConsoleWidth() int32 {
            try {
                return Math.Max(40, Console.WindowWidth)
            } catch {
                return 80
            }
        }

        private func SafeConsoleHeight() int32 {
            try {
                return Math.Max(10, Console.WindowHeight)
            } catch {
                return 24
            }
        }
    }
}
