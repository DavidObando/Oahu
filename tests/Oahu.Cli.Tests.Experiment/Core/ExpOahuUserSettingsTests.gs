// Sanity tests for src/Oahu.Cli.App.Experiment/Core/OahuUserSettings.gs.

package Oahu.Cli.Tests.Experiment.Core

import Oahu.Aux
import Oahu.Core
import Oahu.Cli.App.Experiment.Core
import Xunit

type ExpOahuUserSettingsTests class {

    @Fact
    func Default_Construct_Has_NonNull_Settings() {
        var s = ExpOahuUserSettings()
        Assert.NotNull(s.DownloadSettings)
        Assert.NotNull(s.ConfigSettings)
        Assert.NotNull(s.ExportSettings)
    }

    @Fact
    func Init_Applies_Defaults_Without_Throw() {
        var s = ExpOahuUserSettings()
        s.Init()
        Assert.NotNull(s.DownloadSettings)
    }

    @Fact
    func Implements_IUserSettings() {
        var s = ExpOahuUserSettings()
        Assert.IsAssignableFrom[IUserSettings](s)
    }

    @Fact
    func Implements_IInitSettings() {
        var s = ExpOahuUserSettings()
        Assert.IsAssignableFrom[IInitSettings](s)
    }
}
