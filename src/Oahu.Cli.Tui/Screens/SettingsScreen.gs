package Oahu.Cli.Tui.Screens

import Oahu.Cli.App.Config
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Shell
import Oahu.Cli.Tui.Themes
import Oahu.Cli.Tui.Tokens
import Spectre.Console
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Linq

/// Settings screen (tab 6). Displays and edits (cref:OahuConfig)
/// fields. Per design TUI-exploration §8.
class SettingsScreen : ITabScreen {
    private let configServiceFactory() -> IConfigService
    private var config OahuConfig = OahuConfig.Default
    private var loaded bool
    private var cursor int32
    private var toast string?

    init(configServiceFactory() -> IConfigService) {
        this.configServiceFactory = configServiceFactory ?? throw ArgumentNullException("configServiceFactory")
    }

    prop Title string -> "Settings"
    prop NumberKey char -> '6'
    prop CursorIndex int32 -> cursor

    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get {
            yield KeyValuePair[string, string?]("↑↓", "navigate")
            yield KeyValuePair[string, string?]("enter", "toggle")
            yield KeyValuePair[string, string?]("s", "save")
        }
    }

    func Render(width int32, height int32) IRenderable {
        EnsureLoaded()
        let lines = List[IRenderable]()
        let primary = Tokens.TextPrimary.Value.ToMarkup()
        let secondary = Tokens.TextSecondary.Value.ToMarkup()
        let tertiary = Tokens.TextTertiary.Value.ToMarkup()
        let brand = Tokens.Brand.Value.ToMarkup()
        lines.Add(Markup("[$primary bold]Settings[/]"))
        lines.Add(Markup(string.Empty))
        let values = GetFieldValues()
        for var i = 0;
        i < FieldNames.Length;
        i++ {
            let isCursor = i == cursor
            let pointer = if isCursor {
                "[$brand]❯[/]"
            } else {
                " "
            }
            let style = if isCursor {
                "bold $primary"
            } else {
                secondary
            }
            lines.Add(
                Markup(
                    "  $pointer [$style]${Markup.Escape(FieldNames[i])}[/]  [$tertiary]${Markup.Escape(values[i])}[/]"
                )
            )
        }
        if toast != nil {
            lines.Add(Markup(string.Empty))
            lines.Add(Markup("  [${Tokens.StatusSuccess.Value.ToMarkup()}]${Markup.Escape(toast!!)}[/]"))
        }
        return Padder(Rows(lines)).Padding(2, 1, 2, 1)
    }

    func HandleScroll(delta int32) bool {
        cursor = Math.Clamp(cursor + delta, 0, FieldNames.Length - 1)
        return true
    }

    func HandleKey(key ConsoleKeyInfo) bool {
        toast = nil
        switch key.Key {
            case ConsoleKey.UpArrow, ConsoleKey.K {
                cursor = Math.Max(0, cursor - 1)
                return true
            }
            case ConsoleKey.DownArrow, ConsoleKey.J {
                cursor = Math.Min(FieldNames.Length - 1, cursor + 1)
                return true
            }
            case ConsoleKey.Enter, ConsoleKey.Spacebar {
                ToggleOrCycle()
                return true
            }
            case ConsoleKey.S when key.Modifiers == 0 {
                Save()
                return true
            }
            default {
                let _ = 0
            }
        }
        return false
    }

    /// Reload config from disk.
    func Reload() {
        try {
            let svc = configServiceFactory()
            config = svc.LoadAsync().GetAwaiter().GetResult()
            loaded = true
        } catch {
            // Keep defaults.

        }
    }

    /// Persist config.
    func Save() {
        try {
            let svc = configServiceFactory()
            svc.SaveAsync(config).GetAwaiter().GetResult()
            toast = "✓ Settings saved"
        } catch (ex Exception) {
            toast = "✗ ${ex.Message}"
        }
    }

    internal func EnsureLoaded() {
        if !loaded {
            Reload()
        }
    }

    private func ToggleOrCycle() {
        config = switch cursor {
            case 1: config with{
                DefaultQuality = switch config.DefaultQuality {
                    case DownloadQuality.High: DownloadQuality.Normal
                    default: DownloadQuality.High
                }
            }
            case 2: config with{
                MaxParallelJobs = if config.MaxParallelJobs >= 4 {
                    1
                } else {
                    config.MaxParallelJobs + 1
                }
            }
            case 3: config with{KeepEncryptedFiles = !config.KeepEncryptedFiles}
            case 4: config with{MultiPartDownload = !config.MultiPartDownload}
            case 5: config with{ExportToAax = !config.ExportToAax}
            case ThemeFieldIndex: CycleTheme(config)
            default: config
        }
        if cursor == ThemeFieldIndex {
            // Apply immediately so the user sees the new palette take effect
            // even before pressing 's' to persist.
            try {
                Theme.Use(config.Theme ?? DefaultThemeName)
            } catch {
                // Defensive: should be impossible since CycleTheme only uses known names.

            }
        }
    }

    private func GetFieldValues()[]string {
        return []string{
            config.DownloadDirectory,
            config.DefaultQuality.ToString(),
            config.MaxParallelJobs.ToString(),
            if config.KeepEncryptedFiles {
                "on"
            } else {
                "off"
            },
            if config.MultiPartDownload {
                "on"
            } else {
                "off"
            },
            if config.ExportToAax {
                "on"
            } else {
                "off"
            },
            if string.IsNullOrEmpty(config.ExportDirectory) {
                "(none)"
            } else {
                config.ExportDirectory
            },
            config.Theme ?? "$DefaultThemeName (default)"
        }
    }

    shared {
        private const ThemeFieldIndex int32 = 7
        private const DefaultThemeName string = "Default"

        // Editable fields in display order.
        private let FieldNames[]string = []string{
            "Download directory",
            "Default quality",
            "Max parallel jobs",
            "Keep encrypted files",
            "Multi-part download",
            "Export to AAX",
            "Export directory",
            "Theme"
        }

        private func CycleTheme(cfg OahuConfig) OahuConfig {
            let names = Theme.AvailableNames().ToArray()
            let current = cfg.Theme ?? DefaultThemeName
            let idx = Array.FindIndex(
                names,
                (n string) -> string.Equals(n, current, StringComparison.OrdinalIgnoreCase)
            )
            let next = names[(idx + 1) % names.Length]
            return cfg with{Theme = next}
        }
    }
}
