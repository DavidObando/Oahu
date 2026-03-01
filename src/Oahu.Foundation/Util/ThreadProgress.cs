using System;

namespace Oahu.Common.Util
{
  public abstract class ThreadProgressBase<T> : IDisposable
  {
    private readonly Action<T> report;

    private int accuValuePerMax;

    protected ThreadProgressBase(Action<T> report)
    {
      this.report = report;
    }

    protected abstract int Max { get; }

    public void Dispose()
    {
      int inc = Max - accuValuePerMax;
      if (inc > 0)
      {
        report?.Invoke(GetProgressMessage(inc));
      }
    }

    public void Report(double value)
    {
      int val = (int)(value * Max);
      int total = Math.Min(Max, val);
      int inc = total - accuValuePerMax;
      accuValuePerMax = total;
      if (inc > 0)
      {
        report?.Invoke(GetProgressMessage(inc));
      }
    }

    protected abstract T GetProgressMessage(int inc);
  }

  public class ThreadProgressPerMille : ThreadProgressBase<ProgressMessage>
  {
    public ThreadProgressPerMille(Action<ProgressMessage> report) : base(report)
    {
    }

    protected override int Max => 1000;

    protected override ProgressMessage GetProgressMessage(int inc) => new(null, null, null, inc);
  }

  public class ThreadProgressPerCent : ThreadProgressBase<ProgressMessage>
  {
    public ThreadProgressPerCent(Action<ProgressMessage> report) : base(report)
    {
    }

    protected override int Max => 100;

    protected override ProgressMessage GetProgressMessage(int inc) => new(null, null, inc, null);
  }
}
