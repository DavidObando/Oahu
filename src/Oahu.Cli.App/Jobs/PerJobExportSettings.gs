package Oahu.Cli.App.Jobs

import Oahu.Core
import System

/// Per-job decorator over (cref:IExportSettings) that overrides
/// (cref:IExportSettings.ExportToAax) and (optionally)
/// (cref:IExportSettings.ExportDirectory), delegating any non-overridden
/// member to the wrapped instance.
///
/// Mirrors the rationale of (cref:PerJobDownloadSettings): lets a CLI
/// invocation flip AAX export on or aim it at a different directory without
/// mutating the GUI-shared `OahuUserSettings.ExportSettings`.
class PerJobExportSettings : IExportSettings {
    private let inner IExportSettings
    private let exportToAaxOverride bool?
    private let exportDirectoryOverride string?

    init(inner IExportSettings, exportToAax bool? = nil, exportDirectory string? = nil) {
        this.inner = inner ?? throw ArgumentNullException("inner")
        exportToAaxOverride = exportToAax
        exportDirectoryOverride = exportDirectory
    }

    prop ExportToAax bool? -> exportToAaxOverride ?? inner.ExportToAax
    prop ExportDirectory string -> (exportDirectoryOverride ?? inner.ExportDirectory)
}
