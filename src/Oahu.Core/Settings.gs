package Oahu.Core

import Oahu.Aux.Diagnostics
import Oahu.BooksDatabase
import Oahu.Common.Util
import System

interface IConfigSettings {
    prop EncryptConfiguration bool {
        get;
    }
}

interface IMultiPartSettings {
    prop MultiPartDownload bool {
        get;
    }
}

interface IAuthorizeSettings {
    prop AutoRefresh bool {
        get;
    }
}

interface IDownloadSettings : IMultiPartSettings, IAuthorizeSettings {
    event ChangedSettings EventHandler

    prop AutoUpdateLibrary bool {
        get;
    }

    prop AutoOpenDownloadDialog bool {
        get;
    }

    prop IncludeAdultProducts bool {
        get;
    }

    prop HideUnavailableProducts bool {
        get;
    }

    prop KeepEncryptedFiles bool {
        get;
    }

    prop DownloadQuality EDownloadQuality {
        get;
    }

    prop DownloadDirectory string {
        get;
    }

    prop InitialSorting EInitialSorting {
        get;
    }
}

interface IExportSettings {
    prop ExportToAax bool? {
        get;
    }

    @ToString(typeof(ToStringConverterPath))
    prop ExportDirectory string {
        get;
    }
}

open class SettingsBase {
    event ChangedSettings EventHandler
    func OnChange() -> ChangedSettings?(this, EventArgs.Empty)
}

class ConfigSettings : SettingsBase, IConfigSettings {
    private var encryptConfiguration bool = true

    prop EncryptConfiguration bool {
        get -> encryptConfiguration
        set {
            encryptConfiguration = value
            OnChange()
        }
    }
}

class DownloadSettings : SettingsBase, IDownloadSettings {
    private var downloadQuality EDownloadQualityReducedChoices = EDownloadQualityReducedChoices.High
    prop AutoRefresh bool
    private var _autoUpdateLibrary bool = true

    prop AutoUpdateLibrary bool {
        get {
            return _autoUpdateLibrary
        }
        set {
            _autoUpdateLibrary = value
        }
    }

    prop AutoOpenDownloadDialog bool
    prop IncludeAdultProducts bool
    prop HideUnavailableProducts bool
    prop MultiPartDownload bool
    prop KeepEncryptedFiles bool

    prop DownloadQuality EDownloadQuality {
        get -> downloadQuality.ToFullChoices()
        set -> downloadQuality = value.ToReducedChoices()
    }

    prop DownloadDirectory string
    prop InitialSorting EInitialSorting
    prop Profile ProfileAliasKey?
}

class ExportSettings : SettingsBase, IExportSettings {
    private var exportToAax bool?
    private var exportDirectory string

    prop ExportToAax bool? {
        get -> exportToAax
        set {
            exportToAax = value
            OnChange()
        }
    }

    prop ExportDirectory string {
        get -> exportDirectory
        set {
            exportDirectory = value
            OnChange()
        }
    }
}
