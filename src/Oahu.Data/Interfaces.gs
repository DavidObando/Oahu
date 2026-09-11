package Oahu.BooksDatabase

import Oahu.CommonTypes
import System.Collections.Generic

interface IPerson {
    prop Asin string?
    prop Name string?

    prop Books ICollection[Book]? {
        get;
    }
}

interface IBookCommon : IBookMeta {
    prop FileSizeBytes int64?
    prop RunTimeLengthSeconds int32?
    prop SampleRate int32?
    prop BitRate int32?
    prop DownloadQuality EDownloadQuality?
    prop LicenseKey string?
    prop LicenseIv string?
    prop FileCodec ECodec?
    prop ChapterInfo ChapterInfo?

    prop Conversion Conversion? {
        get;
    }
}

interface IConversion {
    prop Id int32 {
        get;
    }

    prop State EConversionState {
        get;
    }

    prop DownloadFileName string? {
        get;
    }

    prop DestDirectory string? {
        get;
    }
}
