using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Oahu.Aux;
using Oahu.Aux.Extensions;
using Oahu.BooksDatabase;
using Oahu.BooksDatabase.Ex;
using Oahu.Common.Util;
using Oahu.Core.Ex;
using static Oahu.Aux.Logging;
using R = Oahu.Core.Properties.Resources;

namespace Oahu.Core
{
  public class AaxExporter
  {
    const string Json = ".json";
    const string ContentMetadata = "content_metadata_";
    const string SeriesTitles = "series_titles_";

    private static readonly object lockable = new object();

    public AaxExporter(IExportSettings exportSettings, IMultiPartSettings multipartSettings)
    {
      ExportSettings = exportSettings;
      MultipartSettings = multipartSettings;
    }

    public IBookLibrary BookLibrary { private get; set; }

    private IExportSettings ExportSettings { get; }

    private IMultiPartSettings MultipartSettings { get; }

    private List<List<ChapterExtract>> AccuChapters { get; } = new List<List<ChapterExtract>>();

    public void Export(Book book, SimpleConversionContext context, Action<Conversion> onNewStateCallback)
    {
      AccuChapters.Clear();
      using var logGuard = new LogGuard(3, this, () => book.ToString());
      if (book.Components.Count == 0 || !MultipartSettings.MultiPartDownload)
      {
        ExportSinglePart(book, context, onNewStateCallback);
      }
      else
      {
        ExportMultiPart(book, context, onNewStateCallback);
      }
    }

    // internal instead of private for testing only
    internal string ExportChapters(IBookCommon book)
    {
      if (book.ChapterInfo is null)
      {
        BookLibrary?.GetChapters(book);
      }

      if (book.ChapterInfo is null)
      {
        return null;
      }

      Log(3, this, () => book.ToString());

      var chapterInfo = book.ChapterInfo;

      var cr = new Oahu.Audible.Json.ContentReference
      {
        Asin = book.Asin,
        ContentSizeInBytes = book.FileSizeBytes ?? 0,
        Sku = book.Sku
      };

      var ci = new Oahu.Audible.Json.ChapterInfo();
      var metadata = new Oahu.Audible.Json.ContentMetadata
      {
        ChapterInfo = ci,
        ContentReference = cr
      };
      var container = new Oahu.Audible.Json.MetadataContainer
      {
        ContentMetadata = metadata
      };

      ci.BrandIntroDurationMs = chapterInfo.BrandIntroDurationMs;
      ci.BrandOutroDurationMs = chapterInfo.BrandOutroDurationMs;
      ci.IsAccurate = chapterInfo.IsAccurate ?? false;
      ci.RuntimeLengthMs = chapterInfo.RuntimeLengthMs;
      ci.RuntimeLengthSec = chapterInfo.RuntimeLengthMs / 1000;

      var accuChapters = new List<List<ChapterExtract>>();
      var flattenedChapters = BookLibrary?.GetChaptersFlattened(book, accuChapters);

      if (!flattenedChapters.IsNullOrEmpty())
      {
        var chapters = new List<Oahu.Audible.Json.Chapter>();
        foreach (var chapter in flattenedChapters)
        {
          if (chapters.Count == 0 && SkipChapter(chapter))
          {
            continue;
          }

          var ch = new Oahu.Audible.Json.Chapter
          {
            LengthMs = chapter.LengthMs,
            StartOffsetMs = chapter.StartOffsetMs,
            StartOffsetSec = chapter.StartOffsetMs / 1000,
            Title = chapter.Title
          };
          chapters.Add(ch);
        }

        ci.Chapters = chapters.ToArray();
      }

      string json = container.Serialize();
      json = json.CompactJson();

      string filename = ContentMetadata + chapterInfo.BookMeta.Asin + Json;
      string outpath = Path.Combine(ExportSettings.ExportDirectory, filename).AsUncIfLong();

      File.WriteAllText(outpath, json);

      UpdateAccuChapters(accuChapters);

      return outpath;
    }

    private void ExportSinglePart(
      IBookCommon book,
      SimpleConversionContext context,
      Action<Conversion> onNewStateCallback,
      bool skipSeries = false)
    {
      Log(3, this, () => book.ToString());

      book.Conversion.State = EConversionState.Converting;
      onNewStateCallback?.Invoke(book.Conversion);

      bool succ = CopyFile(book, context);
      if (!succ)
      {
        book.Conversion.State = EConversionState.ConversionError;
        onNewStateCallback?.Invoke(book.Conversion);
        return;
      }

      ExportChapters(book);

      ExportProduct(book);

      if (!skipSeries)
      {
        ExportSeries(book);
      }

      BookLibrary.SavePersistentState(book.Conversion, EConversionState.Exported);
      onNewStateCallback?.Invoke(book.Conversion);
    }

    private void ExportMultiPart(
      Book book,
      SimpleConversionContext context,
      Action<Conversion> onNewStateCallback)
    {
      Log(3, this, () => book.ToString());

      bool skipSeries = false;
      foreach (var comp in book.Components)
      {
        ExportSinglePart(comp, context, onNewStateCallback, skipSeries);
        skipSeries = true;
      }
    }

    private bool CopyFile(IBookCommon book, SimpleConversionContext context)
    {
      Log(3, this, () => book.ToString());
      Conversion conv = book.Conversion;
      string sourcefile = (conv.DownloadFileName + R.DecryptedFileExt).AsUncIfLong();
      if (!File.Exists(sourcefile))
      {
        return false;
      }

      string filename = conv.DownloadFileName.GetDownloadFileNameWithoutExtension();
      string destfile = Path.Combine(ExportSettings.ExportDirectory, filename + R.ExportedFileExt).AsUncIfLong();

      try
      {
        lock (lockable)
        {
          bool succ = FileEx.Copy(sourcefile, destfile, true,
            pm => context.Progress?.Report(pm),
            () => context.CancellationToken.IsCancellationRequested);
          return succ;
        }
      }
      catch (Exception exc)
      {
        Log(1, this, () => exc.Summary());
      }

      return false;
    }

    private bool SkipChapter(Chapter ch)
    {
      if (AccuChapters.Count < 2)
      {
        return false;
      }

      for (int i = 0; i < AccuChapters.Count - 1; i++)
      {
        var chextr = AccuChapters[i].FirstOrDefault(ce =>
          string.Equals(ce.Title, ch.Title) &&
          Math.Abs(ce.Length - ch.LengthMs) < 1500 && ch.LengthMs < 25000);
        if (chextr is not null)
        {
          return true;
        }
      }

      return false;
    }

    private void UpdateAccuChapters(List<List<ChapterExtract>> accuPart)
    {
      for (int i = 0; i < accuPart.Count; i++)
      {
        if (AccuChapters.Count < i + 1)
        {
          AccuChapters.Add(new List<ChapterExtract>());
        }

        AccuChapters[i].AddRange(accuPart[i]);
      }
    }

    private void ExportProduct(IBookCommon book)
    {
      Log(3, this, () => book.ToString());
      var product = MakeProduct(book);

      var container = new Oahu.Audible.Json.ProductResponse
      {
        Product = product
      };

      string json = container.Serialize();
      json = json.CompactJson();

      string filename = book.Asin + Json;
      string outpath = Path.Combine(ExportSettings.ExportDirectory, filename).AsUncIfLong();

      File.WriteAllText(outpath, json);
    }

    private void ExportSeries(IBookCommon prod)
    {
      Book book = prod.GetBook();
      if (book.Series.IsNullOrEmpty())
      {
        return;
      }

      Log(3, this, () => book.ToString());

      foreach (var serbook in book.Series)
      {
        var series = serbook.Series;
        string asin = series.Asin;

        var products = new List<Oahu.Audible.Json.Product>();

        // sort by sort/num+sub/sequence
        IOrderedEnumerable<SeriesBook> sbks;
        if (!series.Books.Where(b => b.Sort is null).Any())
        {
          sbks = series.Books.OrderBy(b => b.Sort);
        }
        else if (!series.Books.Where(b => b.BookNumber == 0).Any())
        {
          sbks = series.Books.OrderBy(b => b.BookNumber).ThenBy(b => b.SubNumber);
        }
        else
        {
          sbks = series.Books.OrderBy(b => b.Sequence);
        }

        foreach (var sbk in sbks)
        {
          var p = MakeProduct(sbk.Book);
          products.Add(p);
        }

        var container = new Oahu.Audible.Json.SimsBySeriesResponse
        {
          SimilarProducts = products.ToArray()
        };

        string json = container.Serialize();
        json = json.CompactJson();

        string filename = SeriesTitles + asin + Json;
        string outpath = Path.Combine(ExportSettings.ExportDirectory, filename).AsUncIfLong();

        File.WriteAllText(outpath, json);
      }
    }

    private Oahu.Audible.Json.Product MakeProduct(IBookCommon prod)
    {
      Book book = prod.GetBook();
      Log(3, this, () => book.ToString());

      // has_children;is_adult_product;is_listenable
      // asin
      // authors:name
      // title
      // series:title,sequence
      // sku; sku_lite
      var product = new Oahu.Audible.Json.Product
      {
        Asin = prod.Asin,
        Title = prod.Title,
        Sku = prod.Sku,
        SkuLite = prod.SkuLite,
        IsListenable = true,
        RuntimeLengthMin = prod.RunTimeLengthSeconds / 60,
        HasChildren = prod is Book && book.Components.Count > 0,
        IsAdultProduct = book.AdultProduct ?? false
      };

      if (!book.Authors.IsNullOrEmpty())
      {
        var authors = new List<Oahu.Audible.Json.Author>();
        foreach (var author in book.Authors)
        {
          var a = new Oahu.Audible.Json.Author
          {
            Asin = author.Asin,
            Name = author.Name
          };
          authors.Add(a);
        }

        product.Authors = authors.ToArray();
      }

      if (!book.Series.IsNullOrEmpty())
      {
        var series = new List<Oahu.Audible.Json.Series>();
        foreach (var serbook in book.Series)
        {
          var s = new Oahu.Audible.Json.Series
          {
            Asin = serbook.Series.Asin,
            Title = serbook.Series.Title,
            Sequence = serbook.SeqString
          };
          series.Add(s);
        }

        product.Series = series.ToArray();
      }

      return product;
    }
  }
}
