package Oahu.Aux.Extensions

import System
import System.Threading

/// Type-safe extensions for invoking methods via a synchronization context.
/// Will be executed in the thread of the synchronization context.
///
/// - Post: Action delegate, not waiting for completion.
/// - Send without return type: Action delegate, waiting for completion.
/// - Send with return type: Func delegate, waiting for completion.
///
/// If synchronization context is `null`, delegate will be executed directly.
/// ```xmldoc
/// <example>
///   <code>
/// mySyncContext.Send (helloWorld, "Me");
///
/// void helloWorld (string name) =&gt; Console.WriteLine ("Hello world from " + name);
/// </code>
/// </example>
/// ```
class SyncContextExtensions {
    shared {
        func SendOrPost(sendOrPost((object?) -> void, object?) -> void, delgat() -> void) {
            sendOrPost((o object?) -> delgat(), nil)
        }

        func SendOrPost[T1](sendOrPost((object?) -> void, object) -> void, delgat(T1) -> void, p1 T1) {
            sendOrPost((o object?) -> delgat(T1(o)), p1)
        }

        func SendOrPost[T1, T2](sendOrPost((object?) -> void, object) -> void, delgat(T1, T2) -> void, p1 T1, p2 T2) {
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    delgat(T1(p!![0]), T2(p!![1]))
                },
                []object{p1, p2}
            )
        }

        func SendOrPost[T1, T2, T3](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3) -> void,
            p1 T1,
            p2 T2,
            p3 T3
        ) {
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]))
                },
                []object{p1, p2, p3}
            )
        }

        func SendOrPost[T1, T2, T3, T4](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3, T4) -> void,
            p1 T1,
            p2 T2,
            p3 T3,
            p4 T4
        ) {
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]), T4(p!![3]))
                },
                []object{p1, p2, p3, p4}
            )
        }

        func SendOrPost[T1, T2, T3, T4, T5](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3, T4, T5) -> void,
            p1 T1,
            p2 T2,
            p3 T3,
            p4 T4,
            p5 T5
        ) {
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]), T4(p!![3]), T5(p!![4]))
                },
                []object{p1, p2, p3, p4, p5}
            )
        }

        func SendOrPost[T1, T2, T3, T4, T5, T6](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3, T4, T5, T6) -> void,
            p1 T1,
            p2 T2,
            p3 T3,
            p4 T4,
            p5 T5,
            p6 T6
        ) {
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]), T4(p!![3]), T5(p!![4]), T6(p!![5]))
                },
                []object{p1, p2, p3, p4, p5, p6}
            )
        }

        func SendOrPost[T1, T2, T3, T4, T5, T6, T7](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3, T4, T5, T6, T7) -> void,
            p1 T1,
            p2 T2,
            p3 T3,
            p4 T4,
            p5 T5,
            p6 T6,
            p7 T7
        ) {
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]), T4(p!![3]), T5(p!![4]), T6(p!![5]), T7(p!![6]))
                },
                []object{p1, p2, p3, p4, p5, p6, p7}
            )
        }

        func SendOrPost[T1, T2, T3, T4, T5, T6, T7, T8](
            sendOrPost((object?) -> void, object) -> void,
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
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    delgat(
                        T1(p!![0]),
                        T2(p!![1]),
                        T3(p!![2]),
                        T4(p!![3]),
                        T5(p!![4]),
                        T6(p!![5]),
                        T7(p!![6]),
                        T8(p!![7])
                    )
                },
                []object{p1, p2, p3, p4, p5, p6, p7, p8}
            )
        }

        func SendOrPost[TResult](sendOrPost((object?) -> void, object?) -> void, delgat() -> TResult) TResult {
            var retval = default(TResult)
            sendOrPost(
                (o object?) -> {
                    retval = delgat()
                },
                nil
            )
            return retval
        }

        func SendOrPost[T1, TResult](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1) -> TResult,
            p1 T1
        ) TResult {
            var retval = default(TResult)
            sendOrPost(
                (o object?) -> {
                    retval = delgat(T1(o))
                },
                p1
            )
            return retval
        }

        func SendOrPost[T1, T2, TResult](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2) -> TResult,
            p1 T1,
            p2 T2
        ) TResult {
            var retval = default(TResult)
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    retval = delgat(T1(p!![0]), T2(p!![1]))
                },
                []object{p1, p2}
            )
            return retval
        }

        func SendOrPost[T1, T2, T3, TResult](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3) -> TResult,
            p1 T1,
            p2 T2,
            p3 T3
        ) TResult {
            var retval = default(TResult)
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    retval = delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]))
                },
                []object{p1, p2, p3}
            )
            return retval
        }

        func SendOrPost[T1, T2, T3, T4, TResult](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3, T4) -> TResult,
            p1 T1,
            p2 T2,
            p3 T3,
            p4 T4
        ) TResult {
            var retval = default(TResult)
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    retval = delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]), T4(p!![3]))
                },
                []object{p1, p2, p3, p4}
            )
            return retval
        }

        func SendOrPost[T1, T2, T3, T4, T5, TResult](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3, T4, T5) -> TResult,
            p1 T1,
            p2 T2,
            p3 T3,
            p4 T4,
            p5 T5
        ) TResult {
            var retval = default(TResult)
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    retval = delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]), T4(p!![3]), T5(p!![4]))
                },
                []object{p1, p2, p3, p4, p5}
            )
            return retval
        }

        func SendOrPost[T1, T2, T3, T4, T5, T6, TResult](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3, T4, T5, T6) -> TResult,
            p1 T1,
            p2 T2,
            p3 T3,
            p4 T4,
            p5 T5,
            p6 T6
        ) TResult {
            var retval = default(TResult)
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    retval = delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]), T4(p!![3]), T5(p!![4]), T6(p!![5]))
                },
                []object{p1, p2, p3, p4, p5, p6}
            )
            return retval
        }

        func SendOrPost[T1, T2, T3, T4, T5, T6, T7, TResult](
            sendOrPost((object?) -> void, object) -> void,
            delgat(T1, T2, T3, T4, T5, T6, T7) -> TResult,
            p1 T1,
            p2 T2,
            p3 T3,
            p4 T4,
            p5 T5,
            p6 T6,
            p7 T7
        ) TResult {
            var retval = default(TResult)
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    retval = delgat(T1(p!![0]), T2(p!![1]), T3(p!![2]), T4(p!![3]), T5(p!![4]), T6(p!![5]), T7(p!![6]))
                },
                []object{p1, p2, p3, p4, p5, p6, p7}
            )
            return retval
        }

        func SendOrPost[T1, T2, T3, T4, T5, T6, T7, T8, TResult](
            sendOrPost((object?) -> void, object) -> void,
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
            var retval = default(TResult)
            sendOrPost(
                (o object?) -> {
                    let p[]?object = o as []object
                    retval = delgat(
                        T1(p!![0]),
                        T2(p!![1]),
                        T3(p!![2]),
                        T4(p!![3]),
                        T5(p!![4]),
                        T6(p!![5]),
                        T7(p!![6]),
                        T8(p!![7])
                    )
                },
                []object{p1, p2, p3, p4, p5, p6, p7, p8}
            )
            return retval
        }
    }
}

func (sync SynchronizationContext?) Post(delgat() -> void) {
    if sync == nil {
        delgat()
    } else {
        SyncContextExtensions.SendOrPost(sync.Post, delgat)
    }
}

func (sync SynchronizationContext?) Post[T](delgat(T) -> void, p1 T) {
    if sync == nil {
        delgat(p1)
    } else {
        SyncContextExtensions.SendOrPost(sync.Post, delgat, p1)
    }
}

func (sync SynchronizationContext?) Post[T1, T2](delgat(T1, T2) -> void, p1 T1, p2 T2) {
    if sync == nil {
        delgat(p1, p2)
    } else {
        SyncContextExtensions.SendOrPost(sync.Post, delgat, p1, p2)
    }
}

func (sync SynchronizationContext?) Post[T1, T2, T3](delgat(T1, T2, T3) -> void, p1 T1, p2 T2, p3 T3) {
    if sync == nil {
        delgat(p1, p2, p3)
    } else {
        SyncContextExtensions.SendOrPost(sync.Post, delgat, p1, p2, p3)
    }
}

func (sync SynchronizationContext?) Post[T1, T2, T3, T4](delgat(T1, T2, T3, T4) -> void, p1 T1, p2 T2, p3 T3, p4 T4) {
    if sync == nil {
        delgat(p1, p2, p3, p4)
    } else {
        SyncContextExtensions.SendOrPost(sync.Post, delgat, p1, p2, p3, p4)
    }
}

func (sync SynchronizationContext?) Post[T1, T2, T3, T4, T5](
    delgat(T1, T2, T3, T4, T5) -> void,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4,
    p5 T5
) {
    if sync == nil {
        delgat(p1, p2, p3, p4, p5)
    } else {
        SyncContextExtensions.SendOrPost(sync.Post, delgat, p1, p2, p3, p4, p5)
    }
}

func (sync SynchronizationContext?) Post[T1, T2, T3, T4, T5, T6](
    delgat(T1, T2, T3, T4, T5, T6) -> void,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4,
    p5 T5,
    p6 T6
) {
    if sync == nil {
        delgat(p1, p2, p3, p4, p5, p6)
    } else {
        SyncContextExtensions.SendOrPost(sync.Post, delgat, p1, p2, p3, p4, p5, p6)
    }
}

func (sync SynchronizationContext?) Post[T1, T2, T3, T4, T5, T6, T7](
    delgat(T1, T2, T3, T4, T5, T6, T7) -> void,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4,
    p5 T5,
    p6 T6,
    p7 T7
) {
    if sync == nil {
        delgat(p1, p2, p3, p4, p5, p6, p7)
    } else {
        SyncContextExtensions.SendOrPost(sync.Post, delgat, p1, p2, p3, p4, p5, p6, p7)
    }
}

func (sync SynchronizationContext?) Post[T1, T2, T3, T4, T5, T6, T7, T8](
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
    if sync == nil {
        delgat(p1, p2, p3, p4, p5, p6, p7, p8)
    } else {
        SyncContextExtensions.SendOrPost(sync.Post, delgat, p1, p2, p3, p4, p5, p6, p7, p8)
    }
}

func (sync SynchronizationContext?) Send(delgat() -> void) {
    if sync == nil {
        delgat()
    } else {
        SyncContextExtensions.SendOrPost(sync.Send, delgat)
    }
}

func (sync SynchronizationContext?) Send[T](delgat(T) -> void, p1 T) {
    if sync == nil {
        delgat(p1)
    } else {
        SyncContextExtensions.SendOrPost(sync.Send, delgat, p1)
    }
}

func (sync SynchronizationContext?) Send[T1, T2](delgat(T1, T2) -> void, p1 T1, p2 T2) {
    if sync == nil {
        delgat(p1, p2)
    } else {
        SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3](delgat(T1, T2, T3) -> void, p1 T1, p2 T2, p3 T3) {
    if sync == nil {
        delgat(p1, p2, p3)
    } else {
        SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4](delgat(T1, T2, T3, T4) -> void, p1 T1, p2 T2, p3 T3, p4 T4) {
    if sync == nil {
        delgat(p1, p2, p3, p4)
    } else {
        SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4, T5](
    delgat(T1, T2, T3, T4, T5) -> void,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4,
    p5 T5
) {
    if sync == nil {
        delgat(p1, p2, p3, p4, p5)
    } else {
        SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4, p5)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4, T5, T6](
    delgat(T1, T2, T3, T4, T5, T6) -> void,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4,
    p5 T5,
    p6 T6
) {
    if sync == nil {
        delgat(p1, p2, p3, p4, p5, p6)
    } else {
        SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4, p5, p6)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4, T5, T6, T7](
    delgat(T1, T2, T3, T4, T5, T6, T7) -> void,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4,
    p5 T5,
    p6 T6,
    p7 T7
) {
    if sync == nil {
        delgat(p1, p2, p3, p4, p5, p6, p7)
    } else {
        SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4, p5, p6, p7)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4, T5, T6, T7, T8](
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
    if sync == nil {
        delgat(p1, p2, p3, p4, p5, p6, p7, p8)
    } else {
        SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4, p5, p6, p7, p8)
    }
}

func (sync SynchronizationContext?) Send[TResult](delgat() -> TResult) TResult {
    if sync == nil {
        return delgat()
    } else {
        return SyncContextExtensions.SendOrPost(sync.Send, delgat)
    }
}

func (sync SynchronizationContext?) Send[T, TResult](delgat(T) -> TResult, p1 T) TResult {
    if sync == nil {
        return delgat(p1)
    } else {
        return SyncContextExtensions.SendOrPost(sync.Send, delgat, p1)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, TResult](delgat(T1, T2) -> TResult, p1 T1, p2 T2) TResult {
    if sync == nil {
        return delgat(p1, p2)
    } else {
        return SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, TResult](
    delgat(T1, T2, T3) -> TResult,
    p1 T1,
    p2 T2,
    p3 T3
) TResult {
    if sync == nil {
        return delgat(p1, p2, p3)
    } else {
        return SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4, TResult](
    delgat(T1, T2, T3, T4) -> TResult,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4
) TResult {
    if sync == nil {
        return delgat(p1, p2, p3, p4)
    } else {
        return SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4, T5, TResult](
    delgat(T1, T2, T3, T4, T5) -> TResult,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4,
    p5 T5
) TResult {
    if sync == nil {
        return delgat(p1, p2, p3, p4, p5)
    } else {
        return SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4, p5)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4, T5, T6, TResult](
    delgat(T1, T2, T3, T4, T5, T6) -> TResult,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4,
    p5 T5,
    p6 T6
) TResult {
    if sync == nil {
        return delgat(p1, p2, p3, p4, p5, p6)
    } else {
        return SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4, p5, p6)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4, T5, T6, T7, TResult](
    delgat(T1, T2, T3, T4, T5, T6, T7) -> TResult,
    p1 T1,
    p2 T2,
    p3 T3,
    p4 T4,
    p5 T5,
    p6 T6,
    p7 T7
) TResult {
    if sync == nil {
        return delgat(p1, p2, p3, p4, p5, p6, p7)
    } else {
        return SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4, p5, p6, p7)
    }
}

func (sync SynchronizationContext?) Send[T1, T2, T3, T4, T5, T6, T7, T8, TResult](
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
    if sync == nil {
        return delgat(p1, p2, p3, p4, p5, p6, p7, p8)
    } else {
        return SyncContextExtensions.SendOrPost(sync.Send, delgat, p1, p2, p3, p4, p5, p6, p7, p8)
    }
}
