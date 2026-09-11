package Oahu.Core.Cryptography

import System
import System.Runtime.InteropServices

internal class XXTEA {
    shared {
        func Encrypt(clearBytes ReadOnlySpan[uint8], key[]uint32)[]uint8 {
            ArgumentNullException.ThrowIfNull(key)
            if key.Length != 4 {
                throw ArgumentException("Key must be exactly 4 uint values", "key")
            }
            let n = int32(Math.Ceiling(float64(clearBytes.Length) / 4d))
            let cipherBytes = [n * 4]uint8
            let transformBuffer = MemoryMarshal.Cast[uint8, uint32](cipherBytes.AsSpan())
            clearBytes.CopyTo(cipherBytes)
            Transform(transformBuffer, key, encrypting: true)
            return cipherBytes
        }

        private func Transform(v Span[uint32], key[]uint32, encrypting bool) {
            const DELTA = 0x9e3779b9U
            var p int32
            let n = v.Length
            var rounds = 6 + 52 / n
            var z uint32
            var y uint32
            var sum uint32
            var e uint32
            let MX = func () uint32 {
                return (z >> 5 ^ y << 2) + (y >> 3 ^ z << 4) ^ ((sum ^ y) + (key[int64(p & 3) ^ int64(e)] ^ z))
            }
            if encrypting {
                sum = uint32(0)
                z = v[n - 1]
                for;
                rounds > 0;
                rounds-- {
                    sum += DELTA
                    e = sum >> 2 & uint32(3)
                    for p = 0;
                    p < n - 1;
                    p++ {
                        y = v[p + 1]
                        z = (v[p] += MX())
                    }
                    y = v[0]
                    z = (v[^1] += MX())
                }
            } else {
                sum = uint32(rounds) * DELTA
                y = v[0]
                for;
                rounds > 0;
                rounds-- {
                    e = sum >> 2 & uint32(3)
                    for p = n - 1;
                    p > 0;
                    p-- {
                        z = v[p - 1]
                        y = (v[p] -= MX())
                    }
                    z = v[^1]
                    y = (v[0] -= MX())
                    sum -= DELTA
                }
            }
        }
    }
}
