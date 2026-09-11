package Oahu.BooksDatabase

enum ECodec {
    Format4,
    Mp42232,
    Mp42264,
    Mp44464,
    Mp444128,
    Aax,
    Aax2232,
    Aax2264,
    Aax4464,
    Aax44128
}

enum EDeliveryType {
    SinglePartBook,
    MultiPartBook,
    AudioPart,
    BookSeries,
    Periodical
}

enum EConversionState {
    Unknown,
    Remote,
    Download,
    LicenseGranted,
    LicenseDenied,
    Downloading,
    DownloadError,
    LocalLocked,
    Unlocking,
    UnlockingFailed,
    LocalUnlocked,
    Exported,
    Converting,
    Converted,
    ConvertedUnknown,
    ConversionError
}

enum ELicenseStatusCode {
    Unknown,
    Granted
}

enum EDownloadQuality {
    Low,
    Normal,
    High,
    Extreme
}

enum EPseudoAsinId {
    None,
    Author,
    Narrator
}
