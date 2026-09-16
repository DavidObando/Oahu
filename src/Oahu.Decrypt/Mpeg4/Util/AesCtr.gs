package Oahu.Decrypt.Mpeg4.Util

import System
import System.Security.Cryptography

// https://github.com/FFmpeg/FFmpeg/blob/master/libavutil/aes_ctr.c
unsafe class AesCtr : IDisposable {
    private let encryptor ICryptoTransform
    private let aes Aes
    private let encryptedCounter[]uint8 = [AesBlockSize]uint8
    private var isDisposed bool

    init(key[]uint8) {
        ArgumentNullException.ThrowIfNull(key, "key")
        if key.Length != AesBlockSize {
            throw ArgumentException("${"key"} must be exactly $AesBlockSize bytes long.")
        }
        aes = Aes.Create()
        this.aes.Padding = PaddingMode.None
        this.aes.Mode = CipherMode.ECB
        encryptor = aes.CreateEncryptor(key, nil)
    }

    func Decrypt(iv[]uint8, source ReadOnlySpan[uint8], destination Span[uint8]) {
        ArgumentNullException.ThrowIfNull(iv, "iv")
        ArgumentOutOfRangeException.ThrowIfNotEqual(iv.Length, AesBlockSize, "iv")
        if destination.Length < source.Length {
            throw ArithmeticException("Destination array is not long enough. (Parameter '${"destination"}')")
        }
        const aesNumDwords = AesBlockSize / 4
        fixed pD *uint8 = destination {
            fixed pS *uint8 = source {
                fixed pEc *uint8 = encryptedCounter {
                    var pD32 = *uint32(pD)
                    var pS32 = *uint32(pS)
                    let pEc32 = *uint32(pEc)
                    var dataPos = 0
                    var count = source.Length
                    while count >= AesBlockSize {
                        encryptor.TransformBlock(iv, 0, AesBlockSize, encryptedCounter, 0)
                        IncrementBE(iv)
                        for var i = 0; i < aesNumDwords; i++ {
                            *pD32 = pEc32[i] ^ *pS32
                            pD32++
                            pS32++
                        }
                        dataPos += AesBlockSize
                        count -= AesBlockSize
                    }
                    if count > 0 {
                        encryptor.TransformBlock(iv, 0, AesBlockSize, encryptedCounter, 0)
                        {
                            var i = 0
                            while i < count {
                                pD[dataPos] = uint8((pEc[i] ^ pS[dataPos]))
                                i++
                                dataPos++
                            }
                        }
                    }
                }
            }
        }
    }

    func Dispose() {
        Dispose(true)
        GC.SuppressFinalize(this)
    }

    private func Dispose(disposing bool) {
        if disposing & !isDisposed {
            encryptor.Dispose()
            aes.Dispose()
            isDisposed = true
        }
    }

    shared {
        const AesBlockSize int32 = 16

        private func IncrementBE(data[]uint8) {
            var i = data.Length - 1
            do {
                data[i]++
            } while data[i] == uint8(0) && i-- > 0
        }
    }
}
