package Oahu.Core

import Oahu.Aux
import Oahu.Aux.Extensions
import Oahu.Aux.Logging
import Oahu.BooksDatabase
import Oahu.BooksDatabase.Ex
import Oahu.Common.Util
import R = Oahu.Core.Properties.Resources
import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

class DownloadDecryptJob[T ICancellation] : IDisposable {
    private let threadProgress ConcurrentDictionary[
        (Conversion, int32),
        ThreadProgressBase[ProgressMessage]
    ] = ConcurrentDictionary[(Conversion, int32), ThreadProgressBase[ProgressMessage]]()
    private let runningTasks ConcurrentBag[Task] = ConcurrentBag[Task]()
    private let booksForConversion ConcurrentBag[Book] = ConcurrentBag[Book]()
    private let throttlingSemaphore Semaphore? = Semaphore(MaxDecrypts, MaxDecrypts)

    init(api IAudibleApi, settings IDownloadSettings, onNewStateCallback(Conversion) -> void) {
        AudibleApi = api
        Settings = settings
        OnNewStateCallback = onNewStateCallback
    }

    private prop AudibleApi IAudibleApi {
        get;
        init;
    }

    private prop Settings IDownloadSettings {
        get;
        init;
    }

    private prop OnNewStateCallback(Conversion) -> void {
        get;
        init;
    }

    func Dispose() -> throttlingSemaphore?.Dispose()

    async func DownloadDecryptAndConvertAsync(
        selectedConversions IEnumerable[Conversion],
        progress IProgress[ProgressMessage],
        context T,
        convertAction ConvertDelegate[T]?
    ) {
        using let lg = LogGuard(3, this, () -> "#conv=${selectedConversions.Count()}")
        using let rg = ResourceGuard(
            () -> {
                runningTasks.Clear()
                threadProgress.Clear()
                booksForConversion.Clear()
            }
        )
        progress.Report(ProgressMessage(selectedConversions.Count(), nil, nil, nil))
        let convs = selectedConversions.ToList()
        for conv in convs {
            if context.CancellationToken.IsCancellationRequested {
                return
            }
            progress.Report(ProgressMessage(nil, 1, nil, nil))
            await GetLicenseAndDownloadAsync(conv, progress, context, convertAction)
        }
        while runningTasks.Any((t Task) -> !t.IsCompleted) {
            await Task.WhenAll(runningTasks.ToArray())
        }
    }

    private async func GetLicenseAndDownloadAsync(
        conversion Conversion,
        progress IProgress[ProgressMessage],
        context T,
        convertAction ConvertDelegate[T]?
    ) {
        const TP_KEY = 1
        let OnProgressSize = func (conversion Conversion, progPos int64) {
            if threadProgress.TryGetValue((conversion, TP_KEY), out var tp) {
                let filesize float64 = conversion.BookCommon!!.FileSizeBytes ?? int64(0)
                let val = float64(progPos) / filesize
                tp.Report(val)
            }
        }
        using let lg = LogGuard(3, this, () -> conversion.ToString())
        using let tp = ThreadProgressPerMille((pm ProgressMessage) -> progress.Report(pm), conversion.Book!!.Asin)
        threadProgress.TryAdd((conversion, TP_KEY), tp)
        var succ = true
        // Do we need to download?
        let savedState = AudibleApi.GetPersistentState(conversion)
        // the locked file may already exist
        let hasLockedFile = File.Exists((conversion.DownloadFileName + R.EncryptedFileExt).AsUncIfLong())
        // the unlocked file may already exist
        let hasUnlockedFile = File.Exists((conversion.DownloadFileName + R.DecryptedFileExt).AsUncIfLong())
        // download if neither file exists or state too low
        var doDownload = savedState < EConversionState.LocalLocked || !hasLockedFile
        var doDecrypt = savedState < EConversionState.LocalUnlocked || !hasUnlockedFile
        let previousQuality = conversion.ParentBook!!.ApplicableDownloadQuality(Settings.MultiPartDownload)
        let quality = Settings.DownloadQuality
        let higherQual = quality > previousQuality
        if higherQual {
            Log(3, this, () -> "$conversion; desired higher quality: $quality")
        }
        doDownload |= higherQual
        doDecrypt |= higherQual
        if doDownload && doDecrypt {
            conversion.DownloadFileName = Settings.DownloadDirectory
            // Ensure the download directory exists before writing files
            Directory.CreateDirectory(Settings.DownloadDirectory)
            let licTask = AudibleApi.GetDownloadLicenseAndSaveAsync(conversion, quality)
            OnNewStateCallback(conversion)
            succ = await licTask
            OnNewStateCallback(conversion)
            if !succ {
                AudibleApi.SavePersistentState(conversion, EConversionState.LicenseDenied)
                return
            }
            let dnldTask = AudibleApi.DownloadAsync(conversion, OnProgressSize, context.CancellationToken)
            OnNewStateCallback(conversion)
            succ = await dnldTask
            OnNewStateCallback(conversion)
            if !succ {
                return
            }
        } else {
            AudibleApi.RestorePersistentState(conversion)
            OnNewStateCallback(conversion)
        }
        if succ {
            Log(3, this, () -> "$conversion; submit for decryption.")
            let decryptTask = Task.Run(
                func () Task? {
                    return DecryptAsync(conversion, progress, context, convertAction)
                }
            )
            runningTasks.Add(decryptTask)
        }
    }

    private async func DecryptAsync(
        conversion Conversion,
        progress IProgress[ProgressMessage],
        context T,
        convertAction ConvertDelegate[T]?
    ) {
        const TP_KEY = 2
        let OnProgressTime = func (conversion Conversion, progPos TimeSpan) {
            if threadProgress.TryGetValue((conversion, TP_KEY), out var tp) {
                let runLengthSecs float64 = conversion.BookCommon!!.RunTimeLengthSeconds ?? 0
                let val = progPos.TotalSeconds / runLengthSecs
                tp.Report(val)
            }
        }
        using let lg = LogGuard(3, this, () -> conversion.ToString())
        using let tp = ThreadProgressPerCent((pm ProgressMessage) -> progress.Report(pm), conversion.Book!!.Asin)
        threadProgress.TryAdd((conversion, TP_KEY), tp)
        var succ = true
        // Do we need to decrypt?
        let savedState = AudibleApi.GetPersistentState(conversion)
        // the unlocked file may already exist
        var hasUnlockedFile = File.Exists(conversion.DownloadFileName + R.DecryptedFileExt)
        // decrypt if file does not exist or state too low
        let doDecrypt = savedState < EConversionState.LocalUnlocked || !hasUnlockedFile
        if doDecrypt {
            throttlingSemaphore!!.WaitOne()
            Log(3, this, () -> "$conversion; clear to run")
            {
                using let _ = ResourceGuard(() -> throttlingSemaphore!!.Release())
                let runLengthSecs = conversion.BookCommon!!.RunTimeLengthSeconds ?? 0
                let length = TimeSpan.FromSeconds(runLengthSecs)
                let decrTask = AudibleApi.DecryptAsync(conversion, OnProgressTime, context.CancellationToken)
                OnNewStateCallback(conversion)
                succ = await decrTask
                OnNewStateCallback(conversion)
            }
            try {
                if succ && !Settings.KeepEncryptedFiles {
                    File.Delete(conversion.DownloadFileName + R.EncryptedFileExt)
                }
            } catch (Exception) { }
        } else {
            AudibleApi.RestorePersistentState(conversion)
            OnNewStateCallback(conversion)
        }
        if succ && convertAction != nil {
            let book = conversion.ParentBook!!
            if book.ApplicableState(Settings.MultiPartDownload) >= EConversionState.LocalUnlocked {
                var filesExist = true
                if Settings.MultiPartDownload && !book.Components.IsNullOrEmpty() {
                    for comp in book.Components!! {
                        hasUnlockedFile = File.Exists(
                            (comp.Conversion!!.DownloadFileName + R.DecryptedFileExt).AsUncIfLong()
                        )
                        filesExist &= hasUnlockedFile
                        if !filesExist {
                            break
                        }
                    }
                }
                if filesExist && !booksForConversion.Contains(book) {
                    booksForConversion.Add(book)
                    Log(3, this, () -> "$conversion; submit for conversion.")
                    let convertTask = Task.Run(() -> convertAction(book, context, OnNewStateCallback))
                    runningTasks.Add(convertTask)
                }
            }
        }
    }

    shared {
        private prop MaxDecrypts int32 -> 1
    }
}
