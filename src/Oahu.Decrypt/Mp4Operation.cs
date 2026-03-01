using System;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;

namespace Oahu.Decrypt
{
  public class Mp4Operation
  {
    private readonly CancellationTokenSource cancellationSource = new();
    private readonly Func<CancellationTokenSource, Task> startAction;
    private readonly Action<Task>? continuationAction;
    private ConversionProgressEventArgs? lastArgs;
    private Task? continuation;
    private Task? readerTask;

    internal Mp4Operation(Func<CancellationTokenSource, Task> startAction, Mp4File? mp4File, Action<Task> continuationTask)
        : this(startAction, mp4File)
    {
      continuationAction = continuationTask;
    }

    protected Mp4Operation(Func<CancellationTokenSource, Task> startAction, Mp4File? mp4File)
    {
      this.startAction = startAction;
      Mp4File = mp4File;
    }

    public event EventHandler<ConversionProgressEventArgs>? ConversionProgressUpdate;

    public bool IsCompleted => Continuation?.IsCompleted is true;

    public bool IsFaulted => readerTask?.IsFaulted is true;

    public bool IsCanceled => readerTask?.IsCanceled is true;

    public bool IsCompletedSuccessfully => readerTask?.IsCompletedSuccessfully is true && Continuation?.IsCompletedSuccessfully is true;

    public TimeSpan CurrentProcessPosition => lastArgs?.ProcessPosition ?? TimeSpan.Zero;

    public double ProcessSpeed => lastArgs?.ProcessSpeed ?? 0;

    public TaskStatus TaskStatus => readerTask?.Status ?? TaskStatus.Created;

    public Task OperationTask => Continuation;

    public Mp4File? Mp4File { get; }

    protected virtual Task Continuation => continuation ?? Task.CompletedTask;

    public static Mp4Operation FromCompleted(Mp4File? mp4File)
        => new Mp4Operation(c => Task.CompletedTask, mp4File, _ => { });

    /// <summary>Cancel the operation</summary>
    public Task CancelAsync()
    {
      cancellationSource.Cancel();
      return Continuation is null ? Task.FromCanceled(cancellationSource.Token) : Continuation;
    }

    /// <summary>Start the Mp4 operation</summary>
    public void Start()
    {
      if (readerTask is null)
      {
        readerTask = Task.Run(() => startAction(cancellationSource));
        SetContinuation(readerTask);
      }
    }

    public ConfiguredTaskAwaitable.ConfiguredTaskAwaiter GetAwaiter()
    {
      Start();
      return Continuation.ConfigureAwait(false).GetAwaiter();
    }

    internal void OnProgressUpdate(ConversionProgressEventArgs args)
    {
      lastArgs = args;
      ConversionProgressUpdate?.Invoke(this, args);
    }

    protected virtual void SetContinuation(Task readerTask)
    {
      continuation = readerTask.ContinueWith(t =>
      {
        // Call the continuation delegate to cleanup disposables
        try
        {
          continuationAction?.Invoke(t);
        }
        catch (Exception ex)
        {
          if (t.Exception is null)
          {
            throw;
          }

          throw new AggregateException("Two or more errors occurred.", t.Exception.InnerExceptions.Append(ex));
        }

        if (t.IsFaulted && t.Exception is not null)
        {
          throw t.Exception;
        }
      },
      TaskContinuationOptions.ExecuteSynchronously);
    }
  }
}
