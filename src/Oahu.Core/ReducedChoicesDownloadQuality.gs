package Oahu.Core

import Oahu.BooksDatabase

enum EDownloadQualityReducedChoices {
    Normal,
    High
}

func extension(value EDownloadQualityReducedChoices) ToFullChoices() EDownloadQuality {
    return switch value {
        case EDownloadQualityReducedChoices.High: EDownloadQuality.High
        default: EDownloadQuality.Normal
    }
}

func extension(value EDownloadQuality) ToReducedChoices() EDownloadQualityReducedChoices {
    return switch value {
        case EDownloadQuality.Extreme: EDownloadQualityReducedChoices.High
        case EDownloadQuality.High: EDownloadQualityReducedChoices.High
        default: EDownloadQualityReducedChoices.Normal
    }
}
