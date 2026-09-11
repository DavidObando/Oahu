package Oahu.Cli.Commands

import Oahu.Cli
import Spectre.Console

/// Single source of truth for constructing a Spectre (cref:IAnsiConsole)
/// that obeys both the user's `--no-color` / `NO_COLOR` preference and
/// the auto-degrade-on-non-TTY rule from §9 of the design doc.
class SpectreConsoleFactory {
    shared {
        func Create(globals GlobalOptions) IAnsiConsole {
            let disableAnsi = globals.ForceNoColor || CliEnvironment.ColorDisabled || !CliEnvironment.IsStdoutTty
            let settings = AnsiConsoleSettings{
                Ansi: if disableAnsi {
                    AnsiSupport.No
                } else {
                    AnsiSupport.Detect
                },
                ColorSystem: if disableAnsi {
                    ColorSystemSupport.NoColors
                } else {
                    ColorSystemSupport.Detect
                },
                Interactive: if CliEnvironment.IsStdoutTty {
                    InteractionSupport.Yes
                } else {
                    InteractionSupport.No
                },
                Out: AnsiConsoleOutput(CliEnvironment.Out)
            }
            return AnsiConsole.Create(settings)
        }
    }
}
