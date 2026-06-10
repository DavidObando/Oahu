// G# port of src/Oahu.Cli.App/Jobs/PerJobExportSettings.cs.
// Decorator that overrides ExportToAax and ExportDirectory while delegating to a wrapped IExportSettings.

package Oahu.Cli.App.Experiment.Jobs

import System
import Oahu.Core

type ExpPerJobExportSettings class : IExportSettings {
    Inner IExportSettings
    ExportToAaxOverride Nullable[bool] = nil
    ExportDirectoryOverride string? = nil

    prop ExportToAax Nullable[bool] {
        get {
            if ExportToAaxOverride.HasValue {
                return ExportToAaxOverride
            }
            return Inner.ExportToAax
        }
    }

    prop ExportDirectory string {
        get {
            if ExportDirectoryOverride != nil {
                return ExportDirectoryOverride!!
            }
            return Inner.ExportDirectory
        }
    }
}
