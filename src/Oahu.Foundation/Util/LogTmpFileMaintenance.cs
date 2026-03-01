using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Oahu.Aux;
using Oahu.Aux.Extensions;

namespace Oahu.Common.Util
{
  public class LogTmpFileMaintenance
  {
    // record DirectoryFilesAndStatistics (List<FileInfo> Files, DirectoryStatistics Statistics);
    const int MaxNumFilesPerDir = 500;
    const long MaxSizePerDir = 100_000_000; // 100 MB
    const int MaxAgeDaysPerDir = 365;

    private static LogTmpFileMaintenance instance;

    private bool inProgress;

    private LogTmpFileMaintenance()
    {
    }

    public static LogTmpFileMaintenance Instance
    {
      get
      {
        if (instance is null)
        {
          instance = new LogTmpFileMaintenance();
        }

        return instance;
      }
    }

    private DateTime Today { get; set; }

    private DateTime Timestamp { get; set; }

    public async Task CleanupAsync() => await Task.Run(() => Cleanup());

    public void Cleanup()
    {
      if (inProgress)
      {
        return;
      }

      using var rg = new ResourceGuard(x => inProgress = x);

      TimeSpan days = TimeSpan.FromDays(MaxAgeDaysPerDir);
      DateTime now = DateTime.Now;
      Timestamp = now - days;
      Today = now.Date;

      var tmp = Gather(ApplEnv.TempDirectory);
      var log = Gather(ApplEnv.LogDirectory);

      var tmp2 = Cleanup(tmp.Files, tmp.Stats);
      var log2 = Cleanup(log.Files, log.Stats);

      var tmp3 = Cleanup(tmp.Files, log2?.Timestamp ?? default);
      var log3 = Cleanup(log.Files, tmp2?.Timestamp ?? default);

      int numFiles = (tmp.Stats?.NumFiles ?? 0) + (log.Stats?.NumFiles ?? 0);
      long totalSize = (tmp.Stats?.TotalSize ?? 0) + (log.Stats?.TotalSize ?? 0);

      int removedFiles = tmp2?.NumFiles ?? 0 + log2?.NumFiles ?? 0 + tmp3?.NumFiles ?? 0 + log3?.NumFiles ?? 0;
      long removedSize = (tmp2?.TotalSize ?? 0 + log2?.TotalSize ?? 0 + tmp3?.TotalSize ?? 0 + log3?.TotalSize ?? 0);

      Logging.Log(2, this, () => $"before/after/removed: #files={numFiles}/{numFiles - removedFiles}/{removedFiles} " +
        $"size={totalSize / 1024}/{(totalSize - removedSize) / 1024}/{removedSize / 1024} kB");
    }

    private DirectoryStatistics Cleanup(List<FileInfo> fileInfos, DirectoryStatistics stats) => Cleanup(fileInfos, stats, null);

    private DirectoryStatistics Cleanup(List<FileInfo> fileInfos, DateTime enforceByDate) => Cleanup(fileInfos, null, enforceByDate);

    private DirectoryStatistics Cleanup(List<FileInfo> fileInfos, DirectoryStatistics stats, DateTime? enforceByDate)
    {
      if (fileInfos is null)
      {
        return null;
      }

      bool exceeds = enforceByDate.HasValue || ExceedsThresholds(stats);

      if (!exceeds)
      {
        return default;
      }

      if (enforceByDate.HasValue && enforceByDate.Value < fileInfos.Last().LastWriteTime)
      {
        return default;
      }

      if (!enforceByDate.HasValue && stats is null)
      {
        return default;
      }

      FileInfo[] files = fileInfos.ToArray();

      int numFiles = 0;
      long totalSize = 0;
      DateTime oldest = default;

      for (int i = files.Length - 1; i >= 0; i--)
      {
        var fi = files[i];

        if (fi.LastWriteTime.Date == Today)
        {
          break;
        }

        try
        {
          File.Delete(fi.FullName);

          numFiles++;
          totalSize += fi.Length;
          oldest = i > 1 ? files[i - 1].LastWriteTime : default;

          fileInfos.RemoveAt(i);

          bool done;
          if (enforceByDate.HasValue)
          {
            done = oldest > enforceByDate.Value;
          }
          else
          {
            done = !ExceedsThresholds(new DirectoryStatistics(stats.NumFiles - numFiles, stats.TotalSize - totalSize, oldest));
          }

          if (done)
          {
            break;
          }
        }
        catch (Exception exc)
        {
          Logging.Log(1, this, () => exc.Summary());
        }
      }

      return new DirectoryStatistics(numFiles, totalSize, oldest);
    }

    private (List<FileInfo> Files, DirectoryStatistics Stats) Gather(string dir)
    {
      if (!Directory.Exists(dir))
      {
        return default;
      }

      var di = new DirectoryInfo(dir);
      var fis = di.GetFiles().OrderByDescending(fi => fi.LastWriteTime).ToList();

      long totalSize = 0;
      DateTime oldest = default;

      fis.ForEach(fi =>
      {
        totalSize += fi.Length;
        if (oldest == default || oldest > fi.LastWriteTime)
        {
          oldest = fi.LastWriteTime;
        }
      });

      return (fis, new DirectoryStatistics(fis.Count, totalSize, oldest));
    }

    bool ExceedsThresholds(DirectoryStatistics stats)
    {
      if (stats is null)
      {
        return false;
      }

      bool exceed = stats.NumFiles > MaxNumFilesPerDir ||
        stats.TotalSize > MaxSizePerDir ||
        stats.Timestamp < Timestamp;

      return exceed;
    }

    record DirectoryStatistics(int NumFiles, long TotalSize, DateTime Timestamp);
  }
}
