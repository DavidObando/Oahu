package Oahu.Core

import System
import System.Collections.Generic
import System.IO
import System.Linq
import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.BooksDatabase
import Oahu.BooksDatabase.Ex
import Oahu.Common.Util
import Oahu.Core.Ex
import Oahu.Aux.Logging
import R = Oahu.Core.Properties.Resources
import SystemObject = System.Object
import Oahu.Audible.Json

class AaxExporter {
    init(exportSettings IExportSettings, multipartSettings IMultiPartSettings) {
        AccuChapters = List[List[ChapterExtract]]()
        ExportSettings = exportSettings
        MultipartSettings = multipartSettings
    }

    prop BookLibrary IBookLibrary? {
        private get;
        set;
    }

    private prop ExportSettings IExportSettings {
        get;
        init;
    }

    private prop MultipartSettings IMultiPartSettings {
        get;
        init;
    }

    private prop AccuChapters List[List[ChapterExtract]] {
        get;
        init;
    }

    func Export(book Book, context SimpleConversionContext, onNewStateCallback((Conversion) -> void)?) {
        AccuChapters.Clear()
        using let logGuard = LogGuard(3, this, () -> book.ToString())
        if book.Components!!.Count == 0 || !MultipartSettings.MultiPartDownload {
            ExportSinglePart(book, context, onNewStateCallback)
        } else {
            ExportMultiPart(book, context, onNewStateCallback)
        }
    }

    // internal instead of private for testing only
    internal func ExportChapters(book IBookCommon) string? {
        if book.ChapterInfo == nil {
            BookLibrary?.GetChapters(book)
        }
        if book.ChapterInfo == nil {
            return nil
        }
        Log(3, this, () -> book.ToString())
        let chapterInfo Oahu.BooksDatabase.ChapterInfo? = book.ChapterInfo
        let cr = ContentReference{
            Asin: book.Asin!!,
            ContentSizeInBytes: book.FileSizeBytes ?? int64(0),
            Sku: book.Sku!!
        }
        let ci = Oahu.Audible.Json.ChapterInfo()
        let metadata = ContentMetadata{ChapterInfo: ci, ContentReference: cr}
        let container = MetadataContainer{ContentMetadata: metadata}
        ci.BrandIntroDurationMs = chapterInfo!!.BrandIntroDurationMs
        ci.BrandOutroDurationMs = chapterInfo!!.BrandOutroDurationMs
        ci.IsAccurate = chapterInfo!!.IsAccurate ?? false
        ci.RuntimeLengthMs = chapterInfo!!.RuntimeLengthMs
        ci.RuntimeLengthSec = chapterInfo!!.RuntimeLengthMs / 1000
        let accuChapters = List[List[ChapterExtract]]()
        let flattenedChapters IEnumerable[Oahu.BooksDatabase.Chapter]? = BookLibrary?.GetChaptersFlattened(
            book,
            accuChapters
        )
        if !flattenedChapters.IsNullOrEmpty() {
            let chapters = List[Oahu.Audible.Json.Chapter]()
            for chapter in flattenedChapters!! {
                if chapters.Count == 0 && SkipChapter(chapter) {
                    continue
                }
                let ch = Oahu
                    .Audible
                    .Json
                    .Chapter{
                    LengthMs: chapter.LengthMs,
                    StartOffsetMs: chapter.StartOffsetMs,
                    StartOffsetSec: chapter.StartOffsetMs / 1000,
                    Title: chapter.Title!!
                }
                chapters.Add(ch)
            }
            ci.Chapters = chapters.ToArray()
        }
        var json = container.Serialize()
        json = json.CompactJson()
        let filename = AaxExporter.ContentMetadata + chapterInfo!!.BookMeta!!.Asin + Json
        let outpath = Path.Combine(ExportSettings.ExportDirectory, filename).AsUncIfLong()
        File.WriteAllText(outpath, json)
        UpdateAccuChapters(accuChapters)
        return outpath
    }

    private func ExportSinglePart(
        book IBookCommon,
        context SimpleConversionContext,
        onNewStateCallback((Conversion) -> void)?,
        skipSeries bool = false
    ) {
        Log(3, this, () -> book.ToString())
        book.Conversion!!.State = EConversionState.Converting
        onNewStateCallback?(book.Conversion!!)
        let succ = CopyFile(book, context)
        if !succ {
            book.Conversion!!.State = EConversionState.ConversionError
            onNewStateCallback?(book.Conversion!!)
            return
        }
        ExportChapters(book)
        ExportProduct(book)
        if !skipSeries {
            ExportSeries(book)
        }
        BookLibrary!!.SavePersistentState(book.Conversion!!, EConversionState.Exported)
        onNewStateCallback?(book.Conversion!!)
    }

    private func ExportMultiPart(
        book Book,
        context SimpleConversionContext,
        onNewStateCallback((Conversion) -> void)?
    ) {
        Log(3, this, () -> book.ToString())
        var skipSeries = false
        for comp in book.Components!! {
            ExportSinglePart(comp, context, onNewStateCallback, skipSeries)
            skipSeries = true
        }
    }

    private func CopyFile(book IBookCommon, context SimpleConversionContext) bool {
        Log(3, this, () -> book.ToString())
        let conv = book.Conversion!!
        let sourcefile = (conv.DownloadFileName + R.DecryptedFileExt).AsUncIfLong()
        if !File.Exists(sourcefile) {
            return false
        }
        let filename string? = conv.DownloadFileName.GetDownloadFileNameWithoutExtension()
        let destfile = Path.Combine(ExportSettings.ExportDirectory, filename + R.ExportedFileExt).AsUncIfLong()
        try {
            lock Lockable {
                let succ = FileEx.Copy(
                    sourcefile,
                    destfile,
                    true,
                    (pm ProgressMessage) -> context.Progress?.Report(pm),
                    () -> context.CancellationToken.IsCancellationRequested
                )
                return succ
            }
        } catch (exc Exception) {
            Log(1, this, () -> exc.Summary())
        }
        return false
    }

    private func SkipChapter(ch Oahu.BooksDatabase.Chapter) bool {
        if AccuChapters.Count < 2 {
            return false
        }
        for var i = 0; i < AccuChapters.Count - 1; i++ {
            let chextr ChapterExtract? = AccuChapters[i].FirstOrDefault(
                (ce ChapterExtract) -> string.Equals(ce.Title, ch.Title) && Math.Abs(ce.Length - ch.LengthMs) < 1500 &&
                    ch.LengthMs < 25000
            )
            if chextr != nil {
                return true
            }
        }
        return false
    }

    private func UpdateAccuChapters(accuPart List[List[ChapterExtract]]) {
        for var i = 0; i < accuPart.Count; i++ {
            if AccuChapters.Count < i + 1 {
                AccuChapters.Add(List[ChapterExtract]())
            }
            AccuChapters[i].AddRange(accuPart[i])
        }
    }

    private func ExportProduct(book IBookCommon) {
        Log(3, this, () -> book.ToString())
        let product = MakeProduct(book)
        let container = ProductResponse{Product: product}
        var json = container.Serialize()
        json = json.CompactJson()
        let filename = book.Asin + Json
        let outpath = Path.Combine(ExportSettings.ExportDirectory, filename).AsUncIfLong()
        File.WriteAllText(outpath, json)
    }

    private func ExportSeries(prod IBookCommon) {
        let book = prod.GetBook()!!
        if book.Series.IsNullOrEmpty() {
            return
        }
        Log(3, this, () -> book.ToString())
        for serbook in book.Series!! {
            let series Oahu.BooksDatabase.Series? = serbook.Series
            let asin = series!!.Asin!!
            let products = List[Product]()
            // sort by sort/num+sub/sequence
            var sbks IOrderedEnumerable[SeriesBook]
            if !series!!.Books!!.Where((b SeriesBook) -> b.Sort == nil).Any() {
                sbks = series!!.Books!!.OrderBy(
                    func (b SeriesBook) int32? {
                        return b.Sort
                    }
                )
            } else if !series!!.Books!!.Where((b SeriesBook) -> b.BookNumber == 0).Any() {
                sbks = series!!.Books!!.OrderBy((b SeriesBook) -> b.BookNumber).ThenBy(
                    func (b SeriesBook) int32? {
                        return b.SubNumber
                    }
                )
            } else {
                sbks = series!!.Books!!.OrderBy((b SeriesBook) -> b.Sequence!!)
            }
            for sbk in sbks {
                let p = MakeProduct(sbk.Book!!)
                products.Add(p)
            }
            let container = SimsBySeriesResponse{SimilarProducts: products.ToArray()}
            var json = container.Serialize()
            json = json.CompactJson()
            let filename = SeriesTitles + asin + Json
            let outpath = Path.Combine(ExportSettings.ExportDirectory, filename).AsUncIfLong()
            File.WriteAllText(outpath, json)
        }
    }

    private func MakeProduct(prod IBookCommon) Product {
        let book = prod.GetBook()!!
        Log(3, this, () -> book.ToString())
        // has_children;is_adult_product;is_listenable
        // asin
        // authors:name
        // title
        // series:title,sequence
        // sku; sku_lite
        let product = Product{
            Asin: prod.Asin!!,
            Title: prod.Title!!,
            Sku: prod.Sku!!,
            SkuLite: prod.SkuLite!!,
            IsListenable: true,
            RuntimeLengthMin: prod.RunTimeLengthSeconds / 60,
            HasChildren: prod is Book && book.Components!!.Count > 0,
            IsAdultProduct: book.AdultProduct ?? false
        }
        if !book.Authors.IsNullOrEmpty() {
            let authors = List[Oahu.Audible.Json.Author]()
            for author in book.Authors!! {
                let a = Oahu.Audible.Json.Author{Asin: author.Asin, Name: author.Name!!}
                authors.Add(a)
            }
            product.Authors = authors.ToArray()
        }
        if !book.Series.IsNullOrEmpty() {
            let series = List[Oahu.Audible.Json.Series]()
            for serbook in book.Series!! {
                let s = Oahu
                    .Audible
                    .Json
                    .Series{
                    Asin: serbook.Series!!.Asin!!,
                    Title: serbook.Series!!.Title!!,
                    Sequence: serbook.SeqString!!
                }
                series.Add(s)
            }
            product.Series = series.ToArray()
        }
        return product
    }

    shared {
        private const Json string = ".json"
        private const ContentMetadata string = "content_metadata_"
        private const SeriesTitles string = "series_titles_"
        private let Lockable object = SystemObject()
    }
}
