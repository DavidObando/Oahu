// G# port of src/Oahu.Cli.App/Core/OahuUserSettings.cs.
// Mirrors the Avalonia GUI's UserSettings shape so the CLI and GUI share
// the same usersettings.json under the shared app-data root.

package Oahu.Cli.App.Experiment.Core

import System
import Oahu.Aux
import Oahu.Core

type ExpOahuUserSettings class : IUserSettings, IInitSettings {
    DownloadSettings DownloadSettings = DownloadSettings()
    ConfigSettings ConfigSettings = ConfigSettings()
    ExportSettings ExportSettings = ExportSettings()

    func Init() {
        // Apply shared defaults before subscribing to change events so the
        // autosave hook doesn't fire while we are still hydrating.
        SettingsDefaults.ApplyDefaults(DownloadSettings, ExportSettings)
        // TODO: subscribe to ChangedSettings events for autosave —
        // G# 0.1.516 does not yet support `+=` against CLR events. The CLI
        // is mostly read-only against settings; persistence is owned by GUI.
    }

    func OnChangedSettings(sender object?, e EventArgs) {
        // TODO: call SettingsManager.Save[T](this) — generic extension method
        // with `where T : class, IUserSettings, new()` constraint is not yet
        // callable from G# 0.1.516 (user-defined method type params erased).
        // Tests below cover construction + Init only; persistence is not exercised.
    }
}
