package Oahu.Cli.App.Jobs

import Oahu.BooksDatabase
import Oahu.Core
import System

/// Per-job decorator over (cref:IDownloadSettings) that overrides only
/// (cref:IDownloadSettings.DownloadQuality) while delegating every other
/// member (and the `ChangedSettings` event) to the wrapped instance.
///
/// This is the seam used to honour `JobRequest.Quality` without mutating
/// the process-wide GUI-shared (cref:OahuUserSettings.DownloadSettings).
/// Critical for future concurrency and for not bleeding state across jobs in
/// the same process.
class PerJobDownloadSettings : IDownloadSettings {
    private let inner IDownloadSettings
    private let quality EDownloadQuality

    init(inner IDownloadSettings, quality EDownloadQuality) {
        this.inner = inner ?? throw ArgumentNullException("inner")
        this.quality = quality
    }

    event ChangedSettings EventHandler {
        add {
            this.inner.ChangedSettings += value
        }
        remove {
            this.inner.ChangedSettings -= value
        }
    }

    prop AutoRefresh bool -> inner.AutoRefresh
    prop AutoUpdateLibrary bool -> inner.AutoUpdateLibrary
    prop AutoOpenDownloadDialog bool -> inner.AutoOpenDownloadDialog
    prop IncludeAdultProducts bool -> inner.IncludeAdultProducts
    prop HideUnavailableProducts bool -> inner.HideUnavailableProducts
    prop MultiPartDownload bool -> inner.MultiPartDownload
    prop KeepEncryptedFiles bool -> inner.KeepEncryptedFiles
    prop DownloadQuality EDownloadQuality -> quality
    prop DownloadDirectory string -> inner.DownloadDirectory
    prop InitialSorting EInitialSorting -> inner.InitialSorting
}
