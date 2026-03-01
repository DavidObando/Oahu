using System.Threading;
using System.Threading.Tasks;

namespace Oahu.Decrypt.FrameFilters
{
  public abstract class FrameTransformBase<TInput, TOutput> : FrameFilterBase<TInput>
  {
    private FrameFilterBase<TOutput>? linked;

    public override void SetCancellationToken(CancellationToken cancellationToken)
    {
      base.SetCancellationToken(cancellationToken);
      linked?.SetCancellationToken(cancellationToken);
    }

    public void LinkTo(FrameFilterBase<TOutput> nextFilter) => linked = nextFilter;

    public abstract TOutput PerformFiltering(TInput input);

    protected virtual TOutput? PerformFinalFiltering() => default;

    protected sealed override async Task FlushAsync()
    {
      if (PerformFinalFiltering() is TOutput filteredData && linked is not null)
      {
        await linked.AddInputAsync(filteredData);
      }
    }

    protected sealed override async Task HandleInputDataAsync(TInput input)
    {
      TOutput filteredData = PerformFiltering(input);
      if (linked is null)
      {
#if DEBUG
        // Allow unlinked for testing purposes
        return;
#else
        throw new System.InvalidOperationException($"A FrameTransformBase<TInput, TOutput> must be linked to a FrameFilterBase<TOutput>");
#endif
      }

      await linked.AddInputAsync(filteredData);
    }

    protected sealed override async Task CompleteInternalAsync()
    {
      await base.CompleteInternalAsync();
      await (linked?.CompleteAsync() ?? Task.CompletedTask);
    }

    protected override void Dispose(bool disposing)
    {
      if (disposing && !Disposed)
      {
        linked?.Dispose();
      }

      base.Dispose(disposing);
    }
  }
}
