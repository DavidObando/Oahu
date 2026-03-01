using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace Oahu.Aux
{
  public class ProcessList : IDisposable, IProcessList
  {
    private readonly object lockable = new object();
    private bool disposed = false;

    HashSet<Process> processes = new HashSet<Process>();

    public IProcessList Notify { private get; set; }

    public bool Add(Process process)
    {
      Notify?.Add(process);
      lock (lockable)
      {
        return processes.Add(process);
      }
    }

    public bool Remove(Process process)
    {
      Notify?.Remove(process);
      lock (lockable)
      {
        return processes.Remove(process);
      }
    }

    #region IDisposable Members

    public void Dispose()
    {
      Dispose(true);
      GC.SuppressFinalize(this);
    }

    #endregion
    private void Dispose(bool disposing)
    {
      if (disposed)
      {
        return;
      }

      if (disposing)
      {
      }

      lock (lockable)
      {
        foreach (Process p in processes)
        {
          p.Kill();
        }
      }

      disposed = true;
    }
  }
}
