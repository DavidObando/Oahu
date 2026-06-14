// G# port of Tui/SettingsScreenTests.cs.
//
// Tests SettingsScreen navigation, toggle, save, theme cycling.
// Uses IConfigService interface implementation (now works in 0.1.459).

package Oahu.Cli.Tests.Tui

import System
import System.Collections.Generic
import System.Linq
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Config
import Oahu.Cli.App.Models
import Oahu.Cli.Tui.Screens
import Oahu.Cli.Tui.Themes
import Xunit

class FakeConfigService : IConfigService {
    var Saved OahuConfig? = nil

    prop Path string { get { return "<memory>" } }

    func LoadAsync(ct CancellationToken) Task[OahuConfig] {
        return Task.FromResult(OahuConfig.Default)
    }

    func SaveAsync(config OahuConfig, ct CancellationToken) Task {
        Saved = config
        return Task.CompletedTask
    }
}

@Collection("EnvVarSerial")
class SettingsScreenTests {
    init() {
        Theme.Reset()
    }

    func MakeKey(ch char, k ConsoleKey) ConsoleKeyInfo {
        return ConsoleKeyInfo(ch, k, false, false, false)
    }

    @Fact
    func Navigate_Fields() {
        var screen = SettingsScreen(func() IConfigService { return FakeConfigService() })
        screen.Reload()
        Assert.Equal(0, screen.CursorIndex)
        screen.HandleKey(MakeKey('j', ConsoleKey.J))
        Assert.Equal(1, screen.CursorIndex)
        screen.HandleKey(MakeKey('k', ConsoleKey.K))
        Assert.Equal(0, screen.CursorIndex)
        Theme.Reset()
    }

    @Fact
    func Toggle_Boolean_Field() {
        var svc = FakeConfigService()
        var screen = SettingsScreen(func() IConfigService { return svc })
        screen.Reload()

        // Move to "Keep encrypted files" (index 3)
        screen.HandleKey(MakeKey('j', ConsoleKey.J))
        screen.HandleKey(MakeKey('j', ConsoleKey.J))
        screen.HandleKey(MakeKey('j', ConsoleKey.J))
        Assert.Equal(3, screen.CursorIndex)

        // Toggle it
        screen.HandleKey(MakeKey(' ', ConsoleKey.Spacebar))

        // Save and verify
        screen.Save()
        Assert.True(svc.Saved!!.KeepEncryptedFiles)
        Theme.Reset()
    }

    @Fact
    func Save_Persists_Config() {
        var svc = FakeConfigService()
        var screen = SettingsScreen(func() IConfigService { return svc })
        screen.Reload()
        screen.Save()
        Assert.NotNull(svc.Saved)
        Theme.Reset()
    }

    @Fact
    func Title_Is_Settings() {
        var screen = SettingsScreen(func() IConfigService { return FakeConfigService() })
        Assert.Equal("Settings", screen.Title)
        Assert.Equal('6', screen.NumberKey)
        Theme.Reset()
    }

    @Fact
    func Render_Returns_Renderable() {
        var screen = SettingsScreen(func() IConfigService { return FakeConfigService() })
        var r = screen.Render(80, 20)
        Assert.NotNull(r)
        Theme.Reset()
    }

    @Fact
    func Cycle_Theme_Updates_Config_And_Live_Theme() {
        var svc = FakeConfigService()
        var screen = SettingsScreen(func() IConfigService { return svc })
        screen.Reload()

        // Move cursor to the Theme row (index 7).
        var i = 0
        for i < 7 {
            screen.HandleKey(MakeKey('j', ConsoleKey.J))
            i = i + 1
        }
        Assert.Equal(7, screen.CursorIndex)

        var startName = Theme.Current.Name

        // First cycle from "default" (null) -> next available theme.
        screen.HandleKey(MakeKey(' ', ConsoleKey.Spacebar))
        Assert.NotEqual(startName, Theme.Current.Name)

        // Persist and confirm.
        screen.Save()
        Assert.NotNull(svc.Saved)
        Assert.Equal(Theme.Current.Name, svc.Saved!!.Theme)
        Theme.Reset()
    }

    @Fact
    func Cycle_Theme_Wraps_Through_All_Available_Themes() {
        var svc = FakeConfigService()
        var screen = SettingsScreen(func() IConfigService { return svc })
        screen.Reload()
        var j = 0
        for j < 7 {
            screen.HandleKey(MakeKey('j', ConsoleKey.J))
            j = j + 1
        }

        var seen = HashSet[string]()
        var totalCount = Theme.Available.Count()
        var k = 0
        for k < totalCount + 1 {
            screen.HandleKey(MakeKey(' ', ConsoleKey.Spacebar))
            seen.Add(Theme.Current.Name)
            k = k + 1
        }
        // After cycling through all available, every name has been visited.
        for t in Theme.Available {
            Assert.Contains(t.Name, seen)
        }
        Theme.Reset()
    }
}
