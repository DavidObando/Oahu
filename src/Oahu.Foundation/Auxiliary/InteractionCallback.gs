package Oahu.Aux

import System
import System.Diagnostics.Contracts
import System.Threading

/// Provides an IInteractCallback{T, TResult} that invokes callbacks for interaction on the captured
/// SynchronizationContext.
open class InteractionCallback[T, TResult] : IInteractionCallback[T, TResult] {
    private let synchronizationContext SynchronizationContext?
    private let handler((T) -> TResult)?

    init(handler((T) -> TResult)?) {
        synchronizationContext = SynchronizationContext.Current ?? DefaultContext
        Contract.Assert(synchronizationContext != nil)
        if handler == nil {
            throw ArgumentNullException("handler")
        }
        this.handler = handler
    }

    private func (IInteractionCallback[T, TResult]) Interact(value T) TResult -> OnInteract(value)

    protected open func OnInteract(value T) TResult {
        // If there's no handler, don't bother going through the sync context.
        var retval = default(TResult)
        if handler != nil {
            // Post the processing to the sync context.
            // (If T is a value type, it will get boxed here.)
            synchronizationContext!!.Send(
                (x object?) -> {
                    retval = handler!!(value)
                },
                nil
            )
        }
        return retval
    }

    shared {
        private let DefaultContext SynchronizationContext = SynchronizationContext()
    }
}
