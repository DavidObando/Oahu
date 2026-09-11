package Oahu.BooksDatabase

import Oahu.Aux.Extensions
import Oahu.BooksDatabase.Ex
import Oahu.CommonTypes
import System
import System.Collections.Generic
import System.ComponentModel.DataAnnotations.Schema
import System.Linq
import System.Text

open class Book : IBookMeta, IBookCommon {
    init() {
        Authors = List[Author]()
        Narrators = List[Narrator]()
        Components = List[Component]()
        Series = List[SeriesBook]()
        Genres = List[Genre]()
        Ladders = List[Ladder]()
        Codecs = List[Codec]()
    }

    prop Id int32 {
        get;
        internal set;
    }

    prop Asin string?
    prop Title string?
    prop Subtitle string?
    prop PublisherName string?
    prop PublisherSummary string?
    prop MerchandisingSummary string?
    prop AverageRating float32?
    prop RunTimeLengthSeconds int32?
    prop FileSizeBytes int64?
    prop SampleRate int32?
    prop BitRate int32?
    prop DownloadQuality EDownloadQuality?
    prop FileCodec ECodec?
    prop DeliveryType EDeliveryType?
    prop Unabridged bool?
    prop AdultProduct bool?
    prop PurchaseDate DateTime?
    prop ReleaseDate DateTime?
    prop Language string?
    prop CoverImageUrl string?
    prop CoverImageFile string?
    prop Sku string?
    prop SkuLite string?
    prop LicenseKey string?
    prop LicenseIv string?
    prop Deleted bool?

    @NotMapped
    prop Author string? -> Authors?.Select((a Author) -> a.Name!!).FirstEtAl()

    @NotMapped
    prop MultiAuthors string? -> Authors?.Select((a Author) -> a.Name!!).Combine()

    @NotMapped
    prop Narrator string? -> Narrators?.Select((a Narrator) -> a.Name!!).FirstEtAl()

    @NotMapped
    prop MultiNarrators string? -> Narrators?.Select((a Narrator) -> a.Name!!).Combine()

    open prop ChapterInfo ChapterInfo?
    open prop Conversion Conversion?

    open prop Authors ICollection[Author]? {
        get;
        init;
    }

    open prop Narrators ICollection[Narrator]? {
        get;
        init;
    }

    open prop Components ICollection[Component]? {
        get;
        init;
    }

    open prop Series ICollection[SeriesBook]? {
        get;
        init;
    }

    open prop Genres ICollection[Genre]? {
        get;
        init;
    }

    open prop Ladders ICollection[Ladder]? {
        get;
        init;
    }

    open prop Codecs ICollection[Codec]? {
        get;
        init;
    }

    open override func ToString() string -> "asin=$Asin, \"$Title\""
}

open class Author : IPerson {
    init() {
        Books = List[Book]()
    }

    prop Id int32 {
        get;
        internal set;
    }

    prop Asin string?
    prop Name string?

    open prop Books ICollection[Book]? {
        get;
        init;
    }

    open override func ToString() string -> "asin=$Asin, \"$Name\""
}

open class Narrator : IPerson {
    init() {
        Books = List[Book]()
    }

    prop Id int32 {
        get;
        internal set;
    }

    prop Asin string?
    prop Name string?

    open prop Books ICollection[Book]? {
        get;
        init;
    }

    open override func ToString() string -> "asin=$Asin, \"$Name\""
}

open class Component : IBookCommon {
    prop Id int32 {
        get;
        internal set;
    }

    prop Asin string?
    prop Title string?
    prop PartNumber int32
    prop RunTimeLengthSeconds int32?
    prop FileSizeBytes int64?
    prop SampleRate int32?
    prop BitRate int32?
    prop DownloadQuality EDownloadQuality?
    prop FileCodec ECodec?
    prop Sku string?
    prop SkuLite string?
    prop LicenseKey string?
    prop LicenseIv string?
    open prop Conversion Conversion?
    open prop Book Book?
    open prop ChapterInfo ChapterInfo?

    @NotMapped
    prop Author string? -> Meta?.Author

    @NotMapped
    private prop(IBookMeta) MultiAuthors string? -> Meta?.MultiAuthors

    @NotMapped
    prop Narrator string? -> Meta?.Narrator

    @NotMapped
    private prop(IBookMeta) MultiNarrators string? -> Meta?.MultiNarrators

    @NotMapped
    prop ReleaseDate DateTime? -> Meta?.ReleaseDate

    @NotMapped
    prop PurchaseDate DateTime? -> Meta?.PurchaseDate

    internal prop BookId int32
    private prop Meta IBookMeta? -> Book
    open override func ToString() string -> "asin=$Asin, \"${Book!!.Title}, part $PartNumber\""
}

open class Series {
    init() {
        Books = List[SeriesBook]()
    }

    prop Id int32 {
        get;
        internal set;
    }

    prop Asin string?
    prop Title string?
    prop Sku string?
    prop SkuLite string?

    open prop Books ICollection[SeriesBook]? {
        get;
        init;
    }

    open override func ToString() string -> "asin=$Asin, \"$Title\""
}

open class SeriesBook {
    prop BookNumber int32
    prop SubNumber int32?
    prop Sequence string?
    prop Sort int32?
    open prop Series Series?
    open prop Book Book?

    @NotMapped
    prop SeqString string? {
        get {
            if Sequence == nil {
                return "$BookNumber${(if (SubNumber != nil) { ".${SubNumber!!}" } else { string.Empty })}"
            } else {
                return Sequence!!
            }
        }
    }

    internal prop SeriesId int32
    internal prop BookId int32
    open override func ToString() string -> "${Series!!.Title} [$SeqString]"
}

open class Conversion : IConversion, IBookMeta {
    init() { }

    init(id int32) {
        Id = id
    }

    prop Id int32 {
        get;
        internal set;
    }

    prop State EConversionState
    prop LastUpdate DateTime

    @NotMapped
    prop PersistState EConversionState?

    prop DownloadFileName string?

    @NotMapped
    prop DownloadUrl string?

    prop DestDirectory string?
    prop ConvMode int32?
    prop ConvFormat int32?
    prop Mp4AAudio int32?
    prop AveTrackLengthMinutes int32?
    prop NamedChapters bool?
    prop ChapterMarkAdjusting bool?
    prop PreferEmbChapMarks bool?
    prop VariableBitRate bool?
    prop ReducedBitRate int32?
    prop ShortChapDurSeconds int32?
    prop VeryShortChapDurSeconds int32?
    prop AccountId int32
    prop Region ERegion

    prop BookId int32? {
        get;
        internal set;
    }

    prop ComponentId int32? {
        get;
        internal set;
    }

    open prop Book Book?
    open prop Component Component?

    /// Gets or sets the reason for the most recent failure, when the server supplied one.
    /// Transient and diagnostic only; not persisted.
    @NotMapped
    prop FailureReason string?

    @NotMapped
    prop Asin string? -> BookMeta?.Asin

    @NotMapped
    prop Title string? -> BookMeta?.Title

    @NotMapped
    prop Author string? -> BookMeta?.Author

    @NotMapped
    private prop(IBookMeta) MultiAuthors string? -> BookMeta?.MultiAuthors

    @NotMapped
    prop Narrator string? -> BookMeta?.Narrator

    @NotMapped
    private prop(IBookMeta) MultiNarrators string? -> BookMeta?.MultiNarrators

    @NotMapped
    prop FileSizeBytes int64? -> BookMeta?.FileSizeBytes

    @NotMapped
    prop RunTimeLengthSeconds int32? -> BookMeta?.RunTimeLengthSeconds

    @NotMapped
    prop SampleRate int32? -> BookMeta?.SampleRate

    @NotMapped
    prop BitRate int32? -> BookMeta?.BitRate

    @NotMapped
    prop Sku string? -> BookMeta?.Sku

    @NotMapped
    prop SkuLite string? -> BookMeta?.SkuLite

    @NotMapped
    prop ReleaseDate DateTime? -> BookMeta?.ReleaseDate

    @NotMapped
    prop PurchaseDate DateTime? -> BookMeta?.PurchaseDate

    @NotMapped
    prop ParentBook Book? -> Book ?? Component?.Book

    @NotMapped
    prop BookMeta IBookMeta? -> BookCommon

    @NotMapped
    prop BookCommon IBookCommon? -> if Book == nil {
        (Component as IBookCommon)
    } else {
        cast[IBookCommon](Book!!)
    }

    open override func ToString() string {
        let sb = StringBuilder()
        sb.Append("Id=$Id, ")
        if Book == nil {
            if Component!!.Title == nil {
                sb.Append("\"${ParentBook!!.Title} Part ${Component!!.PartNumber}\"")
            } else {
                sb.Append("\"${Component!!.Title}\"")
            }
        } else {
            sb.Append("\"${Book!!.Title}\"")
        }
        sb.Append(": ${this.ApplicableState()}")
        let s = sb.ToString()
        return s
    }
}

open class Genre {
    init() {
        Books = List[Book]()
    }

    prop ExternalId int64
    prop Name string?

    open prop Books ICollection[Book]? {
        get;
        init;
    }

    internal prop Id int32

    open override func ToString() string -> "$ExternalId: \"$Name\""
}

open class Ladder {
    init() {
        Rungs = List[Rung]()
        Books = List[Book]()
    }

    open prop Rungs ICollection[Rung]? {
        get;
        init;
    }

    open prop Books ICollection[Book]? {
        get;
        init;
    }

    internal prop Id int32

    open override func ToString() string -> Rungs!!.Select((r Rung) -> r.Genre!!.Name!!).Combine(" - ")!!
}

open class Rung {
    init() {
        Ladders = List[Ladder]()
    }

    prop OrderIdx int32
    prop GenreId int32
    open prop Genre Genre?

    open prop Ladders ICollection[Ladder]? {
        get;
        init;
    }

    open override func ToString() string -> "$OrderIdx: ${Genre?.Name}"
}

open class Codec {
    init() {
        Books = List[Book]()
    }

    prop Name ECodec

    open prop Books ICollection[Book]? {
        get;
        init;
    }

    internal prop Id int32

    open override func ToString() string -> "$Id: $Name"
}

open class ChapterInfo {
    init() {
        Chapters = List[Chapter]()
    }

    prop BrandIntroDurationMs int32
    prop BrandOutroDurationMs int32
    prop RuntimeLengthMs int32
    prop IsAccurate bool?
    open prop Book Book?
    open prop Component Component?

    open prop Chapters ICollection[Chapter]? {
        get;
        init;
    }

    @NotMapped
    prop BookMeta IBookMeta? -> if Book == nil {
        (Component as IBookMeta)
    } else {
        cast[IBookMeta](Book!!)
    }

    internal prop Id int32
    internal prop BookId int32?
    internal prop ComponentId int32?

    open override func ToString() string -> "${Component!!.Title}: #chapters=${Chapters!!.Count}, accurate=$IsAccurate"
}

open class Chapter {
    init() {
        Chapters = List[Chapter]()
    }

    init(other Chapter) {
        Chapters = List[Chapter]()
        LengthMs = other.LengthMs
        StartOffsetMs = other.StartOffsetMs
        Title = other.Title
    }

    prop LengthMs int32
    prop StartOffsetMs int32
    prop Title string?
    open prop ChapterInfo ChapterInfo?

    open prop Chapters ICollection[Chapter]? {
        get;
        init;
    }

    open prop ParentChapter Chapter?
    internal prop Id int32
    internal prop ChapterInfoId int32?
    internal prop ParentChapterId int32?

    open override func ToString() string -> "$Title: offs=${TimeSpan.FromMilliseconds(StartOffsetMs)}, len=${TimeSpan.FromMilliseconds(LengthMs)}, #children=${Chapters?.Count}"
}

open class Account {
    prop Id int32 {
        get;
        internal set;
    }

    prop Alias string?
    prop AudibleId string?
}

open class PseudoAsin {
    prop Id EPseudoAsinId
    prop LatestId int32
    open override func ToString() string -> "$Id: ${LatestId:d7}"
}
