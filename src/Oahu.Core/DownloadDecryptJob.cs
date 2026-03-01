using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Oahu.Aux;
using Oahu.Aux.Extensions;
using Oahu.BooksDatabase;
using Oahu.BooksDatabase.Ex;
using Oahu.Common.Util;
using static Oahu.Aux.Logging;
using R = Oahu.Core.Properties.Resources;

namespace Oahu.Core
{
  public class DownloadDecryptJob<T> : IDisposable where T : ICancellation
  {
    private readonly ConcurrentDictionary<(Conversion, int), ThreadProgressBase<ProgressMessage>> threadProgress = new();
    private readonly ConcurrentBag<Task> runningTasks = new();
    private readonly ConcurrentBag<Book> booksForConversion = new();
    private readonly Semaphore throttlingSemaphore = new(MaxDecrypts, MaxDecrypts);

    public DownloadDecryptJob(
      IAudibleApi api,
      IDownloadSettings settings,
      Action<Conversion> onNewStateCallback)
    {
      AudibleApi = api;
      Settings = settings;
      OnNewStateCallback = onNewStateCallback;
    }

    private static int MaxDecrypts => 1; // Environment.ProcessorCount / 2;

    private IAudibleApi AudibleApi { get; }

    private IDownloadSettings Settings { get; }

    private Action<Conversion> OnNewStateCallback { get; }

    public void Dispose() => throttlingSemaphore?.Dispose();

    public async Task DownloadDecryptAndConvertAsync(
      IEnumerable<Conversion> selectedConversions,
      IProgress<ProgressMessage> progress,
      T context,
      ConvertDelegate<T> convertAction)
    {
      using var lg = new LogGuard(3, this, () => $"#conv={selectedConversions.Count()}");

      using var rg = new ResourceGuard(() =>
      {
        runningTasks.Clear();
        threadProgress.Clear();
        booksForConversion.Clear();
      });

      progress.Report(new(selectedConversions.Count(), null, null, null));
      var convs = selectedConversions.ToList();
      foreach (var conv in convs)
      {
        if (context.CancellationToken.IsCancellationRequested)
        {
          return;
        }

        progress.Report(new(null, 1, null, null));
        await GetLicenseAndDownloadAsync(conv, progress, context, convertAction);
      }

      while (runningTasks.Any(t => !t.IsCompleted))
      {
        await Task.WhenAll(runningTasks.ToArray());
      }
    }

    private async Task GetLicenseAndDownloadAsync(
      Conversion conversion,
      IProgress<ProgressMessage> progress,
      T context,
      ConvertDelegate<T> convertAction)
    {
      const int TP_KEY = 1;
      using var lg = new LogGuard(3, this, () => conversion.ToString());

      using var tp = new ThreadProgressPerMille(pm => progress.Report(pm));
      threadProgress.TryAdd((conversion, TP_KEY), tp);

      bool succ = true;

      // Do we need to download?
      var savedState = AudibleApi.GetPersistentState(conversion);

      // the locked file may already exist
      bool hasLockedFile = File.Exists((conversion.DownloadFileName + R.EncryptedFileExt).AsUncIfLong());

      // the unlocked file may already exist
      bool hasUnlockedFile = File.Exists((conversion.DownloadFileName + R.DecryptedFileExt).AsUncIfLong());

      // download if neither file exists or state too low
      bool doDownload = savedState < EConversionState.LocalLocked || !hasLockedFile;
      bool doDecrypt = savedState < EConversionState.LocalUnlocked || !hasUnlockedFile;

      var previousQuality = conversion.ParentBook.ApplicableDownloadQuality(Settings.MultiPartDownload);
      var quality = Settings.DownloadQuality;
      bool higherQual = quality > previousQuality;
      if (higherQual)
      {
        Log(3, this, () => $"{conversion}; desired higher quality: {quality}");
      }

      doDownload |= higherQual;
      doDecrypt |= higherQual;

      if (doDownload && doDecrypt)
      {
        conversion.DownloadFileName = Settings.DownloadDirectory;

        // Ensure the download directory exists before writing files
        Directory.CreateDirectory(Settings.DownloadDirectory);

        var licTask = AudibleApi.GetDownloadLicenseAndSaveAsync(conversion, quality);
        OnNewStateCallback(conversion);
        succ = await licTask;
        OnNewStateCallback(conversion);

        if (!succ)
        {
          AudibleApi.SavePersistentState(conversion, EConversionState.LicenseDenied);
          return;
        }

        var dnldTask = AudibleApi.DownloadAsync(conversion, OnProgressSize, context.CancellationToken);
        OnNewStateCallback(conversion);
        succ = await dnldTask;
        OnNewStateCallback(conversion);

        if (!succ)
        {
          return;
        }
      }
      else
      {
        AudibleApi.RestorePersistentState(conversion);
        OnNewStateCallback(conversion);
      }

      if (succ)
      {
        Log(3, this, () => $"{conversion}; submit for decryption.");
        var decryptTask = Task.Run(() => DecryptAsync(conversion, progress, context, convertAction));
        runningTasks.Add(decryptTask);
      }

      void OnProgressSize(Conversion conversion, long progPos)
      {
        if (threadProgress.TryGetValue((conversion, TP_KEY), out var tp))
        {
          double filesize = conversion.BookCommon.FileSizeBytes ?? 0;
          double val = progPos / filesize;
          tp.Report(val);
        }
      }
    }

    private async Task DecryptAsync(
      Conversion conversion,
      IProgress<ProgressMessage> progress,
      T context,
      ConvertDelegate<T> convertAction)
    {
      const int TP_KEY = 2;
      using var lg = new LogGuard(3, this, () => conversion.ToString());

      using var tp = new ThreadProgressPerCent(pm => progress.Report(pm));
      threadProgress.TryAdd((conversion, TP_KEY), tp);

      bool succ = true;

      // Do we need to decrypt?
      var savedState = AudibleApi.GetPersistentState(conversion);

      // the unlocked file may already exist
      bool hasUnlockedFile = File.Exists(conversion.DownloadFileName + R.DecryptedFileExt);

      // decrypt if file does not exist or state too low
      bool doDecrypt = savedState < EConversionState.LocalUnlocked || !hasUnlockedFile;

      if (doDecrypt)
      {
        throttlingSemaphore.WaitOne();
        Log(3, this, () => $"{conversion}; clear to run");
        using (new ResourceGuard(() => throttlingSemaphore.Release()))
        {
          int runLengthSecs = conversion.BookCommon.RunTimeLengthSeconds ?? 0;
          TimeSpan length = TimeSpan.FromSeconds(runLengthSecs);

          var decrTask = AudibleApi.DecryptAsync(conversion, OnProgressTime, context.CancellationToken);
          OnNewStateCallback(conversion);
          succ = await decrTask;
          OnNewStateCallback(conversion);
        }

        try
        {
          if (succ && !Settings.KeepEncryptedFiles)
          {
            File.Delete(conversion.DownloadFileName + R.EncryptedFileExt);
          }
        }
        catch (Exception)
        {
        }
      }
      else
      {
        AudibleApi.RestorePersistentState(conversion);
        OnNewStateCallback(conversion);
      }

      if (succ && convertAction is not null)
      {
        Book book = conversion.ParentBook;
        if (book.ApplicableState(Settings.MultiPartDownload) >= EConversionState.LocalUnlocked)
        {
          bool filesExist = true;
          if (Settings.MultiPartDownload && !book.Components.IsNullOrEmpty())
          {
            foreach (var comp in book.Components)
            {
              hasUnlockedFile = File.Exists((comp.Conversion.DownloadFileName + R.DecryptedFileExt).AsUncIfLong());
              filesExist &= hasUnlockedFile;
              if (!filesExist)
              {
                break;
              }
            }
          }

          if (filesExist && !booksForConversion.Contains(book))
          {
            booksForConversion.Add(book);
            Log(3, this, () => $"{conversion}; submit for conversion.");
            var convertTask = Task.Run(() => convertAction(book, context, OnNewStateCallback));
            runningTasks.Add(convertTask);
          }
        }
      }

      void OnProgressTime(Conversion conversion, TimeSpan progPos)
      {
        if (threadProgress.TryGetValue((conversion, TP_KEY), out var tp))
        {
          double runLengthSecs = conversion.BookCommon.RunTimeLengthSeconds ?? 0;
          double val = progPos.TotalSeconds / runLengthSecs;
          tp.Report(val);
        }
      }
    }
  }
}
