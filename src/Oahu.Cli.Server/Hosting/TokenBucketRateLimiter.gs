package Oahu.Cli.Server.Hosting

import System
import System.Collections.Concurrent

/// Lightweight token-bucket rate limiter keyed by bearer token. Default policy
/// is 60 requests / minute with a burst of 10 (per design §15.2). The bucket
/// refills continuously based on elapsed wall-clock time so brief idle periods
/// regenerate budget naturally.
/// @remarks We intentionally avoid the framework `RateLimiter` middleware here —
/// the policy is small, the per-token semantics are simpler to express
/// explicitly, and we want to keep transport-layer concerns inside the Server
/// project rather than spreading a new ASP.NET configuration surface.
class TokenBucketRateLimiter {
    private let buckets ConcurrentDictionary[string, Bucket] = ConcurrentDictionary[string, Bucket](
        StringComparer.Ordinal
    )
    private let ratePerSecond float64
    private let burst int32

    convenience init() {
        init(DefaultRatePerSecond, DefaultBurst)
    }

    init(ratePerSecond float64, burst int32) {
        if ratePerSecond <= float64(0.0) {
            throw ArgumentOutOfRangeException("ratePerSecond")
        }
        if burst <= 0 {
            throw ArgumentOutOfRangeException("burst")
        }
        this.ratePerSecond = ratePerSecond
        this.burst = burst
    }

    /// Try to consume one token. Returns false when the caller is rate-limited.
    func TryAcquire(key string) bool {
        if string.IsNullOrEmpty(key) {
            return true // no key = no enforcement (e.g. unauthenticated request, which auth will reject anyway)

        }
        let bucket = this.buckets.GetOrAdd(key, (_ string) -> Bucket(this.burst))
        lock bucket {
            let now = DateTimeOffset.UtcNow
            let elapsed = (now - bucket.LastRefill).TotalSeconds
            if elapsed > float64(0.0) {
                bucket.Tokens = Math.Min(this.burst, bucket.Tokens + (elapsed * this.ratePerSecond))
                bucket.LastRefill = now
            }
            if bucket.Tokens < 1.0 {
                return false
            }
            bucket.Tokens -= 1.0
            return true
        }
    }

    private class Bucket {
        init(initialTokens int32) {
            this.Tokens = initialTokens
            this.LastRefill = DateTimeOffset.UtcNow
        }

        prop Tokens float64
        prop LastRefill DateTimeOffset
    }

    shared {
        /// Sustained refill in tokens per second (60/minute = 1.0).
        private const DefaultRatePerSecond float64 = 1.0

        /// Maximum tokens any caller may accumulate (burst capacity).
        private const DefaultBurst int32 = 10
    }
}
