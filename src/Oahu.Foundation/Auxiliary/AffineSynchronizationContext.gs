package Oahu.Aux

import Oahu.Aux.Extensions
import System
import System.Threading

class AffineSynchronizationContext {
    private let sync SynchronizationContext?
    private let managedThreadId int32

    init() {
        sync = SynchronizationContext.Current
        managedThreadId = Thread.CurrentThread.ManagedThreadId
    }

    private prop Affine bool -> managedThreadId == Thread.CurrentThread.ManagedThreadId

    func Post(delgat() -> void) {
        if Affine {
            delgat()
        } else {
            sync.Post(delgat)
        }
    }

    func Post[T](delgat(T) -> void, p T) {
        if Affine {
            delgat(p)
        } else {
            sync.Post(delgat, p)
        }
    }

    func Post[T1, T2](delgat(T1, T2) -> void, p1 T1, p2 T2) {
        if Affine {
            delgat(p1, p2)
        } else {
            sync.Post(delgat, p1, p2)
        }
    }

    func Post[T1, T2, T3](delgat(T1, T2, T3) -> void, p1 T1, p2 T2, p3 T3) {
        if Affine {
            delgat(p1, p2, p3)
        } else {
            sync.Post(delgat, p1, p2, p3)
        }
    }

    func Post[T1, T2, T3, T4](delgat(T1, T2, T3, T4) -> void, p1 T1, p2 T2, p3 T3, p4 T4) {
        if Affine {
            delgat(p1, p2, p3, p4)
        } else {
            sync.Post(delgat, p1, p2, p3, p4)
        }
    }

    func Post[T1, T2, T3, T4, T5](delgat(T1, T2, T3, T4, T5) -> void, p1 T1, p2 T2, p3 T3, p4 T4, p5 T5) {
        if Affine {
            delgat(p1, p2, p3, p4, p5)
        } else {
            sync.Post(delgat, p1, p2, p3, p4, p5)
        }
    }

    func Post[T1, T2, T3, T4, T5, T6](
        delgat(T1, T2, T3, T4, T5, T6) -> void,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5,
        p6 T6
    ) {
        if Affine {
            delgat(p1, p2, p3, p4, p5, p6)
        } else {
            sync.Post(delgat, p1, p2, p3, p4, p5, p6)
        }
    }

    func Post[T1, T2, T3, T4, T5, T6, T7](
        delgat(T1, T2, T3, T4, T5, T6, T7) -> void,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5,
        p6 T6,
        p7 T7
    ) {
        if Affine {
            delgat(p1, p2, p3, p4, p5, p6, p7)
        } else {
            sync.Post(delgat, p1, p2, p3, p4, p5, p6, p7)
        }
    }

    func Post[T1, T2, T3, T4, T5, T6, T7, T8](
        delgat(T1, T2, T3, T4, T5, T6, T7, T8) -> void,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5,
        p6 T6,
        p7 T7,
        p8 T8
    ) {
        if Affine {
            delgat(p1, p2, p3, p4, p5, p6, p7, p8)
        } else {
            sync.Post(delgat, p1, p2, p3, p4, p5, p6, p7, p8)
        }
    }

    func Send(delgat() -> void) {
        if Affine {
            delgat()
        } else {
            sync.Send(delgat)
        }
    }

    func Send[T](delgat(T) -> void, p T) {
        if Affine {
            delgat(p)
        } else {
            sync.Send(delgat, p)
        }
    }

    func Send[T1, T2](delgat(T1, T2) -> void, p1 T1, p2 T2) {
        if Affine {
            delgat(p1, p2)
        } else {
            sync.Send(delgat, p1, p2)
        }
    }

    func Send[T1, T2, T3](delgat(T1, T2, T3) -> void, p1 T1, p2 T2, p3 T3) {
        if Affine {
            delgat(p1, p2, p3)
        } else {
            sync.Send(delgat, p1, p2, p3)
        }
    }

    func Send[T1, T2, T3, T4](delgat(T1, T2, T3, T4) -> void, p1 T1, p2 T2, p3 T3, p4 T4) {
        if Affine {
            delgat(p1, p2, p3, p4)
        } else {
            sync.Send(delgat, p1, p2, p3, p4)
        }
    }

    func Send[T1, T2, T3, T4, T5](delgat(T1, T2, T3, T4, T5) -> void, p1 T1, p2 T2, p3 T3, p4 T4, p5 T5) {
        if Affine {
            delgat(p1, p2, p3, p4, p5)
        } else {
            sync.Send(delgat, p1, p2, p3, p4, p5)
        }
    }

    func Send[T1, T2, T3, T4, T5, T6](
        delgat(T1, T2, T3, T4, T5, T6) -> void,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5,
        p6 T6
    ) {
        if Affine {
            delgat(p1, p2, p3, p4, p5, p6)
        } else {
            sync.Send(delgat, p1, p2, p3, p4, p5, p6)
        }
    }

    func Send[T1, T2, T3, T4, T5, T6, T7](
        delgat(T1, T2, T3, T4, T5, T6, T7) -> void,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5,
        p6 T6,
        p7 T7
    ) {
        if Affine {
            delgat(p1, p2, p3, p4, p5, p6, p7)
        } else {
            sync.Send(delgat, p1, p2, p3, p4, p5, p6, p7)
        }
    }

    func Send[T1, T2, T3, T4, T5, T6, T7, T8](
        delgat(T1, T2, T3, T4, T5, T6, T7, T8) -> void,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5,
        p6 T6,
        p7 T7,
        p8 T8
    ) {
        if Affine {
            delgat(p1, p2, p3, p4, p5, p6, p7, p8)
        } else {
            sync.Send(delgat, p1, p2, p3, p4, p5, p6, p7, p8)
        }
    }

    func Send[TResult](delgat() -> TResult) TResult {
        if Affine {
            return delgat()
        } else {
            return sync.Send(delgat)
        }
    }

    func Send[T, TResult](delgat(T) -> TResult, p T) TResult {
        if Affine {
            return delgat(p)
        } else {
            return sync.Send(delgat, p)
        }
    }

    func Send[T1, T2, TResult](delgat(T1, T2) -> TResult, p1 T1, p2 T2) TResult {
        if Affine {
            return delgat(p1, p2)
        } else {
            return sync.Send(delgat, p1, p2)
        }
    }

    func Send[T1, T2, T3, TResult](delgat(T1, T2, T3) -> TResult, p1 T1, p2 T2, p3 T3) TResult {
        if Affine {
            return delgat(p1, p2, p3)
        } else {
            return sync.Send(delgat, p1, p2, p3)
        }
    }

    func Send[T1, T2, T3, T4, TResult](delgat(T1, T2, T3, T4) -> TResult, p1 T1, p2 T2, p3 T3, p4 T4) TResult {
        if Affine {
            return delgat(p1, p2, p3, p4)
        } else {
            return sync.Send(delgat, p1, p2, p3, p4)
        }
    }

    func Send[T1, T2, T3, T4, T5, TResult](
        delgat(T1, T2, T3, T4, T5) -> TResult,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5
    ) TResult {
        if Affine {
            return delgat(p1, p2, p3, p4, p5)
        } else {
            return sync.Send(delgat, p1, p2, p3, p4, p5)
        }
    }

    func Send[T1, T2, T3, T4, T5, T6, TResult](
        delgat(T1, T2, T3, T4, T5, T6) -> TResult,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5,
        p6 T6
    ) TResult {
        if Affine {
            return delgat(p1, p2, p3, p4, p5, p6)
        } else {
            return sync.Send(delgat, p1, p2, p3, p4, p5, p6)
        }
    }

    func Send[T1, T2, T3, T4, T5, T6, T7, TResult](
        delgat(T1, T2, T3, T4, T5, T6, T7) -> TResult,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5,
        p6 T6,
        p7 T7
    ) TResult {
        if Affine {
            return delgat(p1, p2, p3, p4, p5, p6, p7)
        } else {
            return sync.Send(delgat, p1, p2, p3, p4, p5, p6, p7)
        }
    }

    func Send[T1, T2, T3, T4, T5, T6, T7, T8, TResult](
        delgat(T1, T2, T3, T4, T5, T6, T7, T8) -> TResult,
        p1 T1,
        p2 T2,
        p3 T3,
        p4 T4,
        p5 T5,
        p6 T6,
        p7 T7,
        p8 T8
    ) TResult {
        if Affine {
            return delgat(p1, p2, p3, p4, p5, p6, p7, p8)
        } else {
            return sync.Send(delgat, p1, p2, p3, p4, p5, p6, p7, p8)
        }
    }
}
