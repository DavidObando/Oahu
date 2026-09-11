package Oahu.Aux

import System

class TimeUtil {
    shared {
        private let EPOCH DateTime = DateTime(1970, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)
        func DateTimeToUnix32(dt DateTime) int32 -> int32(DateTimeToDouble(dt))

        func DateTimeToUnix64(dt DateTime) int64 -> int64(DateTimeToDouble(dt))

        func DateTimeToUnix64Msec(dt DateTime) int64 {
            if dt == default(DateTime) {
                return 0
            }
            let ts = dt.Subtract(EPOCH)
            return int64(ts.TotalMilliseconds)
        }

        func UnixToDateTime(timestamp int64) DateTime {
            if timestamp == int64(0) {
                return default(DateTime)
            }
            let dt = EPOCH.AddSeconds(timestamp)
            return dt
        }

        func UnixMsecToDateTime(timestampMsec int64) DateTime {
            if timestampMsec == int64(0) {
                return default(DateTime)
            }
            let dt = EPOCH.AddMilliseconds(timestampMsec)
            return dt
        }

        private func DateTimeToDouble(dt DateTime) float64 {
            if dt == default(DateTime) {
                return 0.0
            }
            let ts = dt.Subtract(EPOCH)
            return ts.TotalSeconds
        }
    }
}
