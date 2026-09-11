package Oahu.Common.Util

import Oahu.Aux
import Oahu.Aux.Extensions
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading.Tasks

class LogTmpFileMaintenance {
    private var inProgress bool

    private init() { }

    private prop Today DateTime
    private prop Timestamp DateTime

    async func CleanupAsync() -> await Task.Run(() -> Cleanup())

    func Cleanup() {
        if inProgress {
            return
        }
        using let rg = ResourceGuard(
            (x bool) -> {
                inProgress = x
            }
        )
        let days = TimeSpan.FromDays(MaxAgeDaysPerDir)
        let now = DateTime.Now
        Timestamp = now - days
        Today = now.Date
        let tmp = Gather(ApplEnv.TempDirectory)
        let log = Gather(ApplEnv.LogDirectory)
        let tmp2 DirectoryStatistics? = Cleanup(tmp.Files, tmp.Stats)
        let log2 DirectoryStatistics? = Cleanup(log.Files, log.Stats)
        let tmp3 DirectoryStatistics? = Cleanup(tmp.Files, log2?.Timestamp ?? default(DateTime))
        let log3 DirectoryStatistics? = Cleanup(log.Files, tmp2?.Timestamp ?? default(DateTime))
        let numFiles = (tmp.Stats?.NumFiles ?? 0) + (log.Stats?.NumFiles ?? 0)
        let totalSize = (tmp.Stats?.TotalSize ?? int64(0)) + (log.Stats?.TotalSize ?? int64(0))
        let removedFiles = (tmp2?.NumFiles ?? 0) + (log2?.NumFiles ?? 0) + (tmp3?.NumFiles ?? 0) + (log3?.NumFiles ?? 0)
        let removedSize = (tmp2?.TotalSize ?? int64(0)) +
            (log2?.TotalSize ?? int64(0)) +
            (tmp3?.TotalSize ?? int64(0)) +
            (log3?.TotalSize ?? int64(0))
        Logging.Log(
            2,
            this,
            () -> (
                "before/after/removed: #files=$numFiles/${numFiles - removedFiles}/$removedFiles " +
                    "size=${totalSize / int64(1024)}/${(totalSize - removedSize) / int64(1024)}/${removedSize / int64(1024)} kB"
            )
        )
    }

    private func Cleanup(fileInfos List[FileInfo]?, stats DirectoryStatistics?) DirectoryStatistics? -> Cleanup(
        fileInfos,
        stats,
        nil
    )

    private func Cleanup(fileInfos List[FileInfo]?, enforceByDate DateTime) DirectoryStatistics? -> Cleanup(
        fileInfos,
        nil,
        enforceByDate
    )

    private func Cleanup(
        fileInfos List[FileInfo]?,
        stats DirectoryStatistics?,
        enforceByDate DateTime?
    ) DirectoryStatistics? {
        if fileInfos == nil {
            return nil
        }
        if fileInfos.Count == 0 {
            return default(DirectoryStatistics)
        }
        let exceeds = (enforceByDate != nil) || ExceedsThresholds(stats)
        if !exceeds {
            return default(DirectoryStatistics)
        }
        if (enforceByDate != nil) && enforceByDate!!< fileInfos.Last().LastWriteTime {
            return default(DirectoryStatistics)
        }
        if !(enforceByDate != nil) && stats == nil {
            return default(DirectoryStatistics)
        }
        let files = fileInfos.ToArray()
        var numFiles = 0
        var totalSize int64 = 0
        var oldest = default(DateTime)
        for var i = files.Length - 1;
        i >= 0;
        i-- {
            let fi = files[i]
            if fi.LastWriteTime.Date == Today {
                break
            }
            try {
                File.Delete(fi.FullName)
                numFiles++
                totalSize += fi.Length
                oldest = if i > 1 {
                    files[i - 1].LastWriteTime
                } else {
                    default(DateTime)
                }
                fileInfos.RemoveAt(i)
                var done bool
                if (enforceByDate != nil) {
                    done = oldest > enforceByDate
                } else {
                    done = !ExceedsThresholds(
                        DirectoryStatistics(stats!!.NumFiles - numFiles, stats!!.TotalSize - totalSize, oldest)
                    )
                }
                if done {
                    break
                }
            } catch (exc Exception) {
                Logging.Log(1, this, () -> exc.Summary())
            }
        }
        return DirectoryStatistics(numFiles, totalSize, oldest)
    }

    private func Gather(dir string)(Files List[FileInfo]?, Stats DirectoryStatistics?) {
        if !Directory.Exists(dir) {
            return default((Files List[FileInfo], Stats DirectoryStatistics))
        }
        let di = DirectoryInfo(dir)
        let fis = di.GetFiles().OrderByDescending((fi FileInfo) -> fi.LastWriteTime).ToList()
        var totalSize int64 = 0
        var oldest = default(DateTime)
        fis.ForEach(
            (fi FileInfo) -> {
                totalSize += fi.Length
                if oldest == default(DateTime) || oldest > fi.LastWriteTime {
                    oldest = fi.LastWriteTime
                }
            }
        )
        return (fis, DirectoryStatistics(fis.Count, totalSize, oldest))
    }

    private func ExceedsThresholds(stats DirectoryStatistics?) bool {
        if stats == nil {
            return false
        }
        let exceed = stats.NumFiles > MaxNumFilesPerDir ||
            stats.TotalSize > MaxSizePerDir ||
            stats.Timestamp < Timestamp
        return exceed
    }

    private open data class DirectoryStatistics(NumFiles int32, TotalSize int64, Timestamp DateTime) { }

    shared {
        // record DirectoryFilesAndStatistics (List<FileInfo> Files, DirectoryStatistics Statistics);
        private const MaxNumFilesPerDir int32 = 500

        private const MaxSizePerDir int64 = 100_000_000
        private const MaxAgeDaysPerDir int32 = 365
        private var instance LogTmpFileMaintenance?

        prop Instance LogTmpFileMaintenance? {
            get {
                if instance == nil {
                    instance = LogTmpFileMaintenance()
                }
                return instance!!
            }
        }
    }
}
