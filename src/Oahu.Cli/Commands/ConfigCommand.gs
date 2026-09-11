package Oahu.Cli.Commands

import Oahu.Cli
import Oahu.Cli.App.Config
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Models
import Oahu.Cli.App.Paths
import Oahu.Cli.Output
import Oahu.Cli.Tui.Themes
import Spectre.Console
import System
import System.Collections.Generic
import System.CommandLine
import System.CommandLine.Parsing
import System.IO
import System.Threading
import System.Threading.Tasks

/// `oahu-cli config get|set|path` — inspect and update the user's CLI config.
class ConfigCommand {
    shared {
        /// Stable string keys (kebab-case) exposed to users via `config get/set`.
        let Keys IReadOnlyList[string] = []string{
            "download-dir",
            "default-quality",
            "max-parallel-jobs",
            "keep-encrypted-files",
            "multi-part-download",
            "export-to-aax",
            "export-dir",
            "default-profile-alias",
            "allow-encrypted-file-credentials",
            "theme"
        }

        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let cmd = Command("config", "Inspect and update CLI configuration.")
            cmd.Subcommands.Add(CreateGet(resolveGlobals))
            cmd.Subcommands.Add(CreateSet(resolveGlobals))
            cmd.Subcommands.Add(CreatePath(resolveGlobals))
            return cmd
        }

        func ToDictionary(cfg OahuConfig) IReadOnlyDictionary[string, object?] -> Dictionary[string, object?]{
            ["download-dir"] = cfg.DownloadDirectory,
            ["default-quality"] = cfg.DefaultQuality.ToString(),
            ["max-parallel-jobs"] = cfg.MaxParallelJobs,
            ["keep-encrypted-files"] = cfg.KeepEncryptedFiles,
            ["multi-part-download"] = cfg.MultiPartDownload,
            ["export-to-aax"] = cfg.ExportToAax,
            ["export-dir"] = cfg.ExportDirectory,
            ["default-profile-alias"] = cfg.DefaultProfileAlias,
            ["allow-encrypted-file-credentials"] = cfg.AllowEncryptedFileCredentials,
            ["theme"] = cfg.Theme
        }

        func ApplySetting(cfg OahuConfig, key string, value string) OahuConfig -> switch key {
            case "download-dir": cfg with{DownloadDirectory = value}
            case "default-quality": cfg with{DefaultQuality = ParseQuality(value)}
            case "max-parallel-jobs": cfg with{MaxParallelJobs = ParsePositive(value)}
            case "keep-encrypted-files": cfg with{KeepEncryptedFiles = ParseBool(value)}
            case "multi-part-download": cfg with{MultiPartDownload = ParseBool(value)}
            case "export-to-aax": cfg with{ExportToAax = ParseBool(value)}
            case "export-dir": cfg with{ExportDirectory = value}
            case "default-profile-alias": cfg with{
                DefaultProfileAlias = if string.IsNullOrEmpty(value) {
                    default(string?)
                } else {
                    value
                }
            }
            case "allow-encrypted-file-credentials": cfg with{AllowEncryptedFileCredentials = ParseBool(value)}
            case "theme": cfg with{Theme = ParseTheme(value)}
            default: throw ArgumentException("Unknown config key '$key'. Valid: ${string.Join(", ", Keys)}")
        }

        private func CreateGet(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let keyArg = Argument[string?]("key"){
                Arity = ArgumentArity.ZeroOrOne,
                Description = "Specific key to read; omit to dump all."
            }
            let get = Command("get", "Read a single key, or dump every key when no key is given."){keyArg}
            get.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let key = parse.GetValue(keyArg)
                    let path = ResolveConfigFile(globals)
                    let svc = JsonConfigService(path)
                    let cfg = await svc.LoadAsync(ct).ConfigureAwait(false)
                    let writer = OutputWriterFactory.Create(BuildContext(globals))
                    if string.IsNullOrEmpty(key) {
                        writer.WriteResource("config", ToDictionary(cfg))
                        return ExitCodes.Success
                    }
                    let dict = ToDictionary(cfg)
                    if !dict.TryGetValue(key, out var value) {
                        CliEnvironment.Error.WriteLine("oahu-cli: unknown config key '$key'.")
                        CliEnvironment.Error.WriteLine("Known keys: ${string.Join(", ", Keys)}")
                        return ExitCodes.UsageError
                    }
                    writer.WriteResource("config-value", Dictionary[string, object?]{["key"] = key, ["value"] = value})
                    return ExitCodes.Success
                }
            )
            return get
        }

        private func CreateSet(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let keyArg = Argument[string]("key"){Description = "Key to update (one of the documented config keys)."}
            let valueArg = Argument[string]("value"){
                Description = "New value (use the empty string to clear nullable keys)."
            }
            let set = Command("set", "Update a single config key and persist atomically."){keyArg, valueArg}
            set.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    let globals = resolveGlobals(parse)
                    let key = parse.GetValue(keyArg)!!
                    let value = parse.GetValue(valueArg) ?? string.Empty
                    let path = ResolveConfigFile(globals)
                    let svc = JsonConfigService(path)
                    let cfg = await svc.LoadAsync(ct).ConfigureAwait(false)
                    var updated OahuConfig
                    try {
                        updated = ApplySetting(cfg, key, value)
                    } catch (ex ArgumentException) {
                        CliEnvironment.Error.WriteLine("oahu-cli: ${ex.Message}")
                        return ExitCodes.UsageError
                    }
                    await svc.SaveAsync(updated, ct).ConfigureAwait(false)
                    let writer = OutputWriterFactory.Create(BuildContext(globals))
                    writer.WriteSuccess("Set $key = $value")
                    return ExitCodes.Success
                }
            )
            return set
        }

        private func CreatePath(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let path = Command("path", "Print the absolute path to the active config file.")
            path.SetAction(
                (parse ParseResult) -> {
                    let globals = resolveGlobals(parse)
                    let p = ResolveConfigFile(globals)
                    let writer = OutputWriterFactory.Create(BuildContext(globals))
                    writer.WriteResource("config-path", Dictionary[string, object?]{["path"] = p})
                    return ExitCodes.Success
                }
            )
            return path
        }

        func ResolveConfigFile(globals GlobalOptions) string {
            let dir = if !string.IsNullOrEmpty(globals.ConfigDirOverride) {
                globals.ConfigDirOverride!!
            } else {
                CliPaths.ConfigDir
            }
            return Path.Combine(dir, "config.json")
        }

        func BuildContext(g GlobalOptions) OutputContext -> OutputContext(
            OutputContext.ResolveFormat(g.Json, g.Plain, !CliEnvironment.IsStdoutTty),
            g.Quiet,
            useColor: !g.ForceNoColor && !CliEnvironment.ColorDisabled,
            useAscii: g.UseAscii
        )

        private func ParseQuality(s string) DownloadQuality -> switch s.ToLowerInvariant() {
            case "extreme": DownloadQuality.Extreme
            case "high": DownloadQuality.High
            case "normal": DownloadQuality.Normal
            default: throw ArgumentException("Invalid quality '$s'. Valid: extreme, high, normal.")
        }

        private func ParseBool(s string) bool -> switch s.ToLowerInvariant() {
            case "true" or "1" or "yes" or "on": true
            case "false" or "0" or "no" or "off" or "": false
            default: throw ArgumentException("Invalid boolean '$s'. Valid: true|false|yes|no|on|off|1|0.")
        }

        private func ParsePositive(s string) int32 -> if int32.TryParse(s, out var n) && n > 0 {
            n
        } else {
            throw ArgumentException("Invalid positive integer '$s'.")
            default(int32)
        }

        private func ParseTheme(s string) string? {
            if string.IsNullOrEmpty(s) {
                return nil
            }
            for name in Theme.AvailableNames() {
                if string.Equals(name, s, StringComparison.OrdinalIgnoreCase) {
                    return name
                }
            }
            throw ArgumentException(
                "Invalid theme '$s'. Valid: ${string.Join(", ", Theme.AvailableNames())} (or empty to clear)."
            )
        }
    }
}
