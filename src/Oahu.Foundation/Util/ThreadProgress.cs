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
    private readonly string asin;

    public ThreadProgressPerMille(Action<ProgressMessage> report, string asin = null) : base(report)
    {
      this.asin = asin;
    }

    protected override int Max => 1000;

    protected override ProgressMessage GetProgressMessage(int inc) => new(null, null, null, inc, asin);
  }

  public class ThreadProgressPerCent : ThreadProgressBase<ProgressMessage>
  {
    private readonly string asin;

    public ThreadProgressPerCent(Action<ProgressMessage> report, string asin = null) : base(report)
    {
      this.asin = asin;
    }

    protected override int Max => 100;

    protected override ProgressMessage GetProgressMessage(int inc) => new(null, null, inc, null, asin);
  }
}
