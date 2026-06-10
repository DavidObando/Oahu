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
            let o = ExportToAaxOverride
            if o.HasValue {
                return o
            }
            return Inner.ExportToAax
        }
    }

    prop ExportDirectory string {
        get {
            let o = ExportDirectoryOverride
            if o != nil {
                return o!!
            }
            return Inner.ExportDirectory
        }
    }
}
