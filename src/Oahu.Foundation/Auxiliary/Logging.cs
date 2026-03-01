using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading;
using Oahu.Aux.Extensions;
using static Oahu.Aux.ApplEnv;

namespace Oahu.Aux
{
  public class Logging
  {
    public const long DefaultFileSize = 20 * 1024 * 1024;

    const string EXT = ".log";

    private readonly object lockable = new object();
    private bool instantFlush;
    private bool fullClassNames;
    private uint prettyTypeNameLevel = 2;
    private int level = -1;
    private string currentfilename;
    private uint filecount;
    private DateTime filedate;
    private string filestub;
    private bool ignoreExisting;
    private StreamWriter logStreamWriter;
    private System.Threading.Timer flushTimer;
    private uint linecount;
    private bool logfileLocationOutputDone;

    // cannot instatiate from outside class
    private Logging() => SetFileNameStub();

    public static int Level
    {
      get => Instance.level;
      set => Instance.SetLevel(value);
    }

    public static bool InstantFlush
    {
      get => Instance.instantFlush;
      set => Instance.instantFlush = value;
    }

    public static bool FullClassNames
    {
      get => Instance.fullClassNames;
      set => Instance.fullClassNames = value;
    }

    public static uint PrettyTypeNameLevel
    {
      get => Instance.prettyTypeNameLevel;
      set => Instance.prettyTypeNameLevel = value;
    }

    private static Logging Instance { get; } = new Logging();

    private static long FileSize => DefaultFileSize;

    private TextWriter Writer => logStreamWriter;

    public static void Log(uint level, object caller, [CallerMemberName] string method = null) => Instance.Log0(level, caller, method);

    public static void Log(uint level, Type caller, [CallerMemberName] string method = null) => Instance.Log0(level, caller, method);

    public static void Log(uint level, object caller, string what, [CallerMemberName] string method = null) => Instance.LogInternal(level, caller, what, method);

    public static void Log(uint level, Type caller, string what, [CallerMemberName] string method = null) => Instance.LogInternal(level, caller, what, method);

    public static void Log(uint level, object caller, Func<string> getWhat, [CallerMemberName] string method = null) => Instance.LogInternal(level, caller, getWhat, method);

    public static void Log(uint level, Type caller, Func<string> getWhat, [CallerMemberName] string method = null) => Instance.LogInternal(level, caller, getWhat, method);

    // public static void Log (uint level, string msg) => Log (level, null, msg);
    // public static void Log (uint level, string context, string msg) => Instance.log (level, context, msg);
    private static string Context(object caller, string method) => Context(caller.GetType(), method);

    // private static string context (string method) => $"???.{method}";
    private static string Context(Type caller, string method)
    {
      string typename = caller.PrettyName((int)PrettyTypeNameLevel, FullClassNames);
      return $"{typename}.{method}";
    }

    private static string Format(LogMessage msg)
    {
      string ctx = string.IsNullOrWhiteSpace(msg.Context) ? string.Empty : $"[{msg.Context}] ";
      string s = $"{msg.DateTime:HH:mm:ss.fff} {msg.ThreadId:0000} {ctx}{msg.Message}";
      return s;
    }

    private void SetLevel(int value)
    {
      {
        if (value >= 0)
        {
          level = value;
          LogInternal($"{nameof(Level)}={level}");
        }
      }
    }

    private void Log0(uint level, object caller, [CallerMemberName] string method = null)
    {
      if (level <= this.level)
      {
        LogInternal(level, Context(caller, method), null);
      }
    }

    private void Log0(uint level, Type caller, [CallerMemberName] string method = null)
    {
      if (level <= this.level)
      {
        LogInternal(level, Context(caller, method), null);
      }
    }

    private void LogInternal(uint level, object caller, string what, [CallerMemberName] string method = null)
    {
      if (level <= this.level)
      {
        LogInternal(level, Context(caller, method), what);
      }
    }

    private void LogInternal(uint level, Type caller, string what, [CallerMemberName] string method = null)
    {
      if (level <= this.level)
      {
        LogInternal(level, Context(caller, method), what);
      }
    }

    private void LogInternal(uint level, object caller, Func<string> getWhat, [CallerMemberName] string method = null)
    {
      if (level <= this.level && !(getWhat is null))
      {
        LogInternal(level, Context(caller, method), getWhat());
      }
    }

    private void LogInternal(uint level, Type caller, Func<string> getWhat, [CallerMemberName] string method = null)
    {
      if (level <= this.level && !(getWhat is null))
      {
        LogInternal(level, Context(caller, method), getWhat());
      }
    }

    private void LogInternal(uint level, string context, string msg)
    {
      if (level <= this.level)
      {
        LogInternal(context, msg);
      }
    }

    private void LogInternal(string msg) => LogInternal(null, msg);

    private void LogInternal(string context, string msg) => HandleWrite(new LogMessage(context, msg));

    private void HandleWrite(LogMessage logMessage)
    {
      EnsureWriter();
      Write(logMessage);
    }

    private void EnsureWriter()
    {
      // Do we have a stream writer?
      lock (lockable)
      {
        if (logStreamWriter is null)
        {
          OpenWriter(true);
        }
        else
        {
          if (DateTime.Now.Date != filedate.Date)
          {
            NextWriter(true);
          }
          else if (logStreamWriter.BaseStream.Position >= FileSize)
          {
            NextWriter(false);
          }
        }
      }
    }

    private void NextWriter(bool newDay)
    {
      Close();
      OpenWriter(newDay);
    }

    private void Close()
    {
      CloseFlushTimer();
      CloseWriter();
    }

    private void CloseFlushTimer()
    {
      if (flushTimer != null)
      {
        flushTimer.Dispose();
      }

      flushTimer = null;
    }

    private void CloseWriter()
    {
      if (!(logStreamWriter is null))
      {
        logStreamWriter.Dispose();
      }

      logStreamWriter = null;
    }

    private void OpenWriter(bool newDay)
    {
      if (newDay)
      {
        filedate = DateTime.Today.Date;
        filecount = 0;
        ignoreExisting = false;
      }

      string stub = $"{filestub}_{filedate:yyyy-MM-dd}_";
      string ext = EXT;

      var filenames = GetExisting(stub);

      string filename = null;
      while (true)
      {
        // next file, theoretically
        filecount++;

        // build a filename
        filename = $"{stub}{filecount:000}{ext}";

        bool exists = filenames?.Where(n => filename.ToLower().IndexOf(n) >= 0).Any() ?? false;

        if (exists && !ignoreExisting)
        {
          if (filecount < 1000)
          {
            continue;
          }

          ignoreExisting = true;
          filecount = 1;
        }

        bool succ = OpenWriter(filename);
        if (succ)
        {
          break;
        }
      }

      if (!logfileLocationOutputDone)
      {
        logfileLocationOutputDone = true;
        Console.WriteLine($"{typeof(Logging).Name} written to \"{filename}\".");
      }
    }

    private IEnumerable<string> GetExisting(string stub)
    {
      string folder = Path.GetDirectoryName(stub);

      if (!Directory.Exists(folder))
      {
        return null;
      }

      string filestub = Path.GetFileNameWithoutExtension(stub);

      string search = $"{filestub}*{EXT}";
      string[] files = Directory.GetFiles(folder, search);
      var names = files.Select(f => Path.GetFileName(f.ToLower()));
      return names;
    }

    private bool OpenWriter(string filename)
    {
      FileMode createOption = ignoreExisting ? FileMode.Create : FileMode.CreateNew;

      string folder = Path.GetDirectoryName(filename);
      filename = Path.GetFileName(filename);
      if (string.IsNullOrEmpty(folder))
      {
        folder = LogDirectory;
      }

      filename = Path.Combine(folder, filename);

      Directory.CreateDirectory(folder);

      Stream stream = new FileStream(filename, createOption, FileAccess.ReadWrite);
      logStreamWriter = new StreamWriter(stream);
      currentfilename = filename;

      if (!InstantFlush)
      {
        OpenFlushTimer();
      }

      return true;
    }

    private void OpenFlushTimer()
    {
      flushTimer = new System.Threading.Timer(FlushTimerCallback, null, 5000, 5000);
    }

    private void Write(LogMessage msg)
    {
      string s = Format(msg);
      lock (lockable)
      {
        Writer.WriteLine(s);
        if (InstantFlush)
        {
          Writer.Flush();
        }
        else
        {
          linecount++;
        }
      }
    }

    private void FlushTimerCallback(object state)
    {
      lock (lockable)
      {
        if (linecount > 0)
        {
          Writer.Flush();
        }

        linecount = 0;
      }
    }

    private void SetFileNameStub()
    {
      filecount = 0;
      filedate = DateTime.Today;
      filestub = Path.Combine(LogDirectory, ApplName);
    }

    class LogMessage
    {
      public LogMessage(string message) : this(null, message)
      {
      }

      public LogMessage(string context, string message) : this(DateTime.Now, Thread.CurrentThread.ManagedThreadId, context, message)
      {
      }

      public LogMessage(DateTime timestamp, int threadId, string context, string message)
      {
        DateTime = timestamp;
        ThreadId = threadId;
        Context = context;
        Message = message;
      }

      public DateTime DateTime { get; private set; }

      public int ThreadId { get; private set; }

      public string Context { get; private set; }

      public string Message { get; private set; }
    }
  }
}
