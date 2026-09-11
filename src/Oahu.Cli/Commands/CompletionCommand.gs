package Oahu.Cli.Commands

import Oahu.Cli
import Oahu.Cli.App.Errors
import System
import System.CommandLine
import System.CommandLine.Parsing

/// `oahu-cli completion <shell>` — emit a static shell-completion script
/// for one of bash/zsh/fish/pwsh.
///
/// The scripts delegate to `oahu-cli` for the canonical subcommand list.
/// They intentionally hard-code the v1 surface so completions work on systems
/// that block subprocess calls during tab-completion (e.g. corp-managed pwsh).
class CompletionCommand {
    shared {
        let SupportedShells[]string = []string{"bash", "zsh", "fish", "pwsh"}
        let V1Subcommands[]string = []string{
            "tui",
            "doctor",
            "ui-preview",
            "auth",
            "library",
            "queue",
            "download",
            "convert",
            "history",
            "config",
            "completion"
        }

        func Create() Command {
            let shellArg = Argument[string]("shell"){Description = "One of: bash, zsh, fish, pwsh."}
            shellArg.AcceptOnlyFromAmong(SupportedShells)
            let cmd = Command("completion", "Print a shell-completion script for the named shell."){shellArg}
            cmd.SetAction(
                (parse ParseResult) -> {
                    let shell = parse.GetValue(shellArg)!!
                    let script = Render(shell)
                    CliEnvironment.Out.Write(script)
                    return ExitCodes.Success
                }
            )
            return cmd
        }

        func Render(shell string) string -> switch shell.ToLowerInvariant() {
            case "bash": RenderBash()
            case "zsh": RenderZsh()
            case "fish": RenderFish()
            case "pwsh": RenderPwsh()
            default: throw ArgumentException("Unsupported shell '$shell'. Valid: ${string.Join(", ", SupportedShells)}")
        }

        private func RenderBash() string {
            let subs = string.Join(' ', V1Subcommands)
            return (`# oahu-cli bash completion. Source this file or copy into /etc/bash_completion.d/.
_oahu_cli_complete() {
  local cur prev
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "` + "$subs" + `" -- "$cur") )
    return 0
  fi
  return 0
}
complete -F _oahu_cli_complete oahu-cli
`)
        }

        private func RenderZsh() string {
            let subs = string.Join(' ', V1Subcommands)
            return (`#compdef oahu-cli
# oahu-cli zsh completion.
_oahu_cli() {
  local -a subcommands
  subcommands=(` + "$subs" + `)
  if (( CURRENT == 2 )); then
    _describe 'oahu-cli command' subcommands
    return
  fi
}
_oahu_cli "$@"
`)
        }

        private func RenderFish() string {
            let lines = string.Join(
                '\n',
                Array.ConvertAll(
                    V1Subcommands,
                    (sub string) -> "complete -c oahu-cli -n '__fish_use_subcommand' -a $sub"
                )
            )
            return (`# oahu-cli fish completion. Drop into ~/.config/fish/completions/.
` + "$lines" + `
`)
        }

        private func RenderPwsh() string {
            let subs = string.Join(", ", Array.ConvertAll(V1Subcommands, (s string) -> "'$s'"))
            return (`# oahu-cli PowerShell completion. dot-source this file from your profile.
Register-ArgumentCompleter -Native -CommandName oahu-cli -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $tokens = $commandAst.CommandElements
  if ($tokens.Count -le 2) {
    $subcommands = @(` + "$subs" + `)
    $subcommands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
  }
}
`)
        }
    }
}
