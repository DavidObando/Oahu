using System;
using System.Diagnostics.Contracts;
using System.Threading;

namespace Oahu.Aux
{
  /// <summary>
  /// Provides an IInteractCallback{T, TResult} that invokes callbacks for interaction on the captured SynchronizationContext.
  /// </summary>
  public class InteractionCallback<T, TResult> : IInteractionCallback<T, TResult>
  {
    private static readonly SynchronizationContext DefaultContext = new SynchronizationContext();

    private readonly SynchronizationContext synchronizationContext;
    private readonly Func<T, TResult> handler;

    public InteractionCallback(Func<T, TResult> handler)
    {
      synchronizationContext = SynchronizationContext.Current ?? DefaultContext;
      Contract.Assert(synchronizationContext != null);
      if (handler is null)
      {
        throw new ArgumentNullException(nameof(handler));
      }

      this.handler = handler;
    }

    TResult IInteractionCallback<T, TResult>.Interact(T value) => OnInteract(value);

    protected virtual TResult OnInteract(T value)
    {
      // If there's no handler, don't bother going through the sync context.
      TResult retval = default(TResult);
      if (handler != null)
      {
        // Post the processing to the sync context.
        // (If T is a value type, it will get boxed here.)
        synchronizationContext.Send(new SendOrPostCallback((x) =>
        {
          retval = handler(value);
        }),
        null);
      }

      return retval;
    }
  }
}
