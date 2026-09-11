package Oahu.CommonTypes

import System

interface IBookMeta : IAudioQuality {
    prop Asin string? {
        get;
    }

    prop Title string? {
        get;
    }

    prop Author string? {
        get;
    }

    prop MultiAuthors string? {
        get;
    }

    prop FileSizeBytes int64? {
        get;
    }

    prop RunTimeLengthSeconds int32? {
        get;
    }

    prop Narrator string? {
        get;
    }

    prop MultiNarrators string? {
        get;
    }

    prop Sku string? {
        get;
    }

    prop SkuLite string? {
        get;
    }

    prop ReleaseDate DateTime? {
        get;
    }

    prop PurchaseDate DateTime? {
        get;
    }
}

interface IAudioQuality {
    prop SampleRate int32? {
        get;
    }

    prop BitRate int32? {
        get;
    }
}
