package Oahu.Decrypt.FrameFilters.Audio

import Oahu.Decrypt.FrameFilters
import System
import System.Security.Cryptography

internal open class AavdFilter : AacValidateFilter {
    private let aes Aes
    private let iv[]uint8

    init(key[]?uint8, iv[]?uint8) {
        if key == nil || key.Length != AesBlockSize {
            throw ArgumentException("${"key"} must be $AesBlockSize bytes long.")
        }
        if iv == nil || iv.Length != AesBlockSize {
            throw ArgumentException("${"iv"} must be $AesBlockSize bytes long.")
        }
        this.aes = Aes.Create()
        this.aes.Key = key
        this.iv = iv
    }

    open override func PerformFiltering(input FrameEntry) FrameEntry {
        if input.FrameData.Length >= 0x10 {
            let encBlocks = input.FrameData.Slice(0, input.FrameData.Length & 0x7ffffff0).Span
            aes.DecryptCbc(encBlocks, iv, encBlocks, PaddingMode.None)
        }
        return base.PerformFiltering(input)
    }

    protected open override func Dispose(disposing bool) {
        if disposing && !Disposed {
            aes.Dispose()
        }
        base.Dispose(disposing)
    }

    shared {
        private const AesBlockSize int32 = 16
    }
}
