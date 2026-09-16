package Oahu.Cli.Tests.Tui

import Oahu.Cli.App.Config
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Themes
import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Xunit

@Collection("EnvVarSerial")
class SettingsScreenTests : IDisposable {
    init() {
        Theme.Reset()
    }

    func Dispose() -> Theme.Reset()

    @Fact
    func Navigate_Fields() {
        let screen = SettingsScreen(
            func () IConfigService {
                return FakeConfigService()
            }
        )
        screen.Reload()
        Assert.Equal(0, screen.CursorIndex)
        screen.HandleKey(Key('j', ConsoleKey.J))
        Assert.Equal(1, screen.CursorIndex)
        screen.HandleKey(Key('k', ConsoleKey.K))
        Assert.Equal(0, screen.CursorIndex)
    }

    @Fact
    func Toggle_Boolean_Field() {
        let svc = FakeConfigService()
        let screen = SettingsScreen(
            func () IConfigService {
                return svc
            }
        )
        screen.Reload()
        // Move to "Keep encrypted files" (index 3)
        screen.HandleKey(Key('j', ConsoleKey.J))
        screen.HandleKey(Key('j', ConsoleKey.J))
        screen.HandleKey(Key('j', ConsoleKey.J))
        Assert.Equal(3, screen.CursorIndex)
        // Toggle it
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        // Save and verify
        screen.Save()
        Assert.True(svc.Saved?.KeepEncryptedFiles)
    }

    @Fact
    func Save_Persists_Config() {
        let svc = FakeConfigService()
        let screen = SettingsScreen(
            func () IConfigService {
                return svc
            }
        )
        screen.Reload()
        screen.Save()
        Assert.NotNull(svc.Saved)
    }

    @Fact
    func Title_Is_Settings() {
        let screen = SettingsScreen(
            func () IConfigService {
                return FakeConfigService()
            }
        )
        Assert.Equal("Settings", screen.Title)
        Assert.Equal('6', screen.NumberKey)
    }

    @Fact
    func Render_Returns_Renderable() {
        let screen = SettingsScreen(
            func () IConfigService {
                return FakeConfigService()
            }
        )
        let r = screen.Render(80, 20)
        Assert.NotNull(r)
    }

    @Fact
    func Cycle_Theme_Updates_Config_And_Live_Theme() {
        let svc = FakeConfigService()
        let screen = SettingsScreen(
            func () IConfigService {
                return svc
            }
        )
        screen.Reload()
        // Move cursor to the Theme row (index 7).
        for var i = 0; i < 7; i++ {
            screen.HandleKey(Key('j', ConsoleKey.J))
        }
        Assert.Equal(7, screen.CursorIndex)
        let startName = Theme.Current.Name
        // First cycle from "default" (null) → next available theme.
        screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
        Assert.NotEqual(startName, Theme.Current.Name)
        // Persist and confirm.
        screen.Save()
        Assert.NotNull(svc.Saved)
        Assert.Equal(Theme.Current.Name, svc.Saved!!.Theme)
    }

    @Fact
    func Cycle_Theme_Wraps_Through_All_Available_Themes() {
        let svc = FakeConfigService()
        let screen = SettingsScreen(
            func () IConfigService {
                return svc
            }
        )
        screen.Reload()
        for var i = 0; i < 7; i++ {
            screen.HandleKey(Key('j', ConsoleKey.J))
        }
        let seen = HashSet[string]()
        for var i = 0; i < Theme.Available.Count + 1; i++ {
            screen.HandleKey(Key(' ', ConsoleKey.Spacebar))
            seen.Add(Theme.Current.Name)
        }
        // After cycling through all available, every name has been visited.
        for t in Theme.Available {
            Assert.Contains(t.Name, seen)
        }
    }

    private class FakeConfigService : IConfigService {
        prop Path string -> "<memory>"
        prop Saved OahuConfig?
        func LoadAsync(ct CancellationToken = default(CancellationToken)) Task[OahuConfig] -> Task.FromResult(
            OahuConfig.Default
        )

        func SaveAsync(config OahuConfig, ct CancellationToken = default(CancellationToken)) Task {
            Saved = config
            return Task.CompletedTask
        }
    }

    shared {
        private func Key(
            ch char,
            k ConsoleKey = ConsoleKey.NoName,
            mod ConsoleModifiers = ConsoleModifiers.None
        ) ConsoleKeyInfo -> ConsoleKeyInfo(
            ch,
            k,
            shift: (mod & ConsoleModifiers.Shift) != 0,
            alt: (mod & ConsoleModifiers.Alt) != 0,
            control: (mod & ConsoleModifiers.Control) != 0
        )
    }
}
