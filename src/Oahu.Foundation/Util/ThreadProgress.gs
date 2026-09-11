package Oahu.Common.Util

import System

open class ThreadProgressBase[T] : IDisposable {
    private let report((T) -> void)?
    private var accuValuePerMax int32

    protected init(report((T) -> void)?) {
        this.report = report
    }

    protected open prop Max int32 {
        get;
    }

    func Dispose() {
        let inc = Max - accuValuePerMax
        if inc > 0 {
            report?(GetProgressMessage(inc))
        }
    }

    func Report(value float64) {
        let val = int32((value * float64(Max)))
        let total = Math.Min(Max, val)
        let inc = total - accuValuePerMax
        accuValuePerMax = total
        if inc > 0 {
            report?(GetProgressMessage(inc))
        }
    }

    protected open func GetProgressMessage(inc int32) T;
}

open class ThreadProgressPerMille : ThreadProgressBase[ProgressMessage] {
    private let asin string?

    init(report((ProgressMessage) -> void)?, asin string? = nil) : base(report) {
        this.asin = asin
    }

    protected open override prop Max int32 -> 1000

    protected open override func GetProgressMessage(inc int32) ProgressMessage -> ProgressMessage(
        nil,
        nil,
        nil,
        inc,
        asin
    )
}

open class ThreadProgressPerCent : ThreadProgressBase[ProgressMessage] {
    private let asin string?

    init(report((ProgressMessage) -> void)?, asin string? = nil) : base(report) {
        this.asin = asin
    }

    protected open override prop Max int32 -> 100

    protected open override func GetProgressMessage(inc int32) ProgressMessage -> ProgressMessage(
        nil,
        nil,
        inc,
        nil,
        asin
    )
}
