package Oahu.Aux

import System
import System.Runtime.CompilerServices

class LogGuard : IDisposable {
    private let level uint32
    private let $func(() -> string)?
    private let msg string?
    private let method string?
    private let caller object
    private let type Type?
    private var isDispose bool

    init(level uint32, type Type, func_() -> string, @CallerMemberName method string? = nil) {
        this.level = level
        this.type = type
        this.$func = func_
        this.method = method
        Logging.Log(level, type, GetFuncMsg, method)
    }

    init(level uint32, caller object, func_() -> string, @CallerMemberName method string? = nil) {
        this.level = level
        this.caller = caller
        this.$func = func_
        this.method = method
        Logging.Log(level, caller, GetFuncMsg, method)
    }

    init(level uint32, type Type, msg string, @CallerMemberName method string? = nil) {
        this.level = level
        this.type = type
        this.msg = msg
        this.method = method
        Logging.Log(level, type, GetMsg, method)
    }

    init(level uint32, caller object, msg string, @CallerMemberName method string? = nil) {
        this.level = level
        this.caller = caller
        this.msg = msg
        this.method = method
        Logging.Log(level, caller, GetMsg(), method)
    }

    init(level uint32, type Type, @CallerMemberName method string? = nil) {
        this.level = level
        this.type = type
        this.method = method
        Logging.Log(level, type, () -> IN, method)
    }

    init(level uint32, caller object, @CallerMemberName method string? = nil) {
        this.level = level
        this.caller = caller
        this.method = method
        Logging.Log(level, caller, () -> IN, method)
    }

    func Dispose() {
        isDispose = true
        if type == nil {
            if $func == nil {
                if msg == nil {
                    Logging.Log(level, caller, () -> OUT, method)
                } else {
                    Logging.Log(level, caller, GetMsg(), method)
                }
            } else {
                Logging.Log(level, caller, GetFuncMsg, method)
            }
        } else if type != nil {
            if $func == nil {
                if msg == nil {
                    Logging.Log(level, type, () -> OUT, method)
                } else {
                    Logging.Log(level, type, GetMsg(), method)
                }
            } else {
                Logging.Log(level, type, GetFuncMsg, method)
            }
        }
    }

    private func GetFuncMsg() string {
        let prefix = if isDispose {
            OUT
        } else {
            IN
        }
        return prefix + $func?()
    }

    private func GetMsg() string {
        let prefix = if isDispose {
            OUT
        } else {
            IN
        }
        return prefix + msg
    }

    shared {
        private const IN string = ">>> "
        private const OUT string = "<<< "
    }
}
