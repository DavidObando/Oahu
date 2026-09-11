package Oahu.Decrypt.Mpeg4

import System
import System.IO

/// A read-only stream that tracks the stream position based on the number of bytes read.
open class TrackedReadStream : Stream {
    private let baseStream Stream
    private let baseStreamLength int64
    private var readPosition int64 = 0

    init(baseStream Stream, streamLength int64) {
        this.baseStream = baseStream
        baseStreamLength = streamLength
    }

    open override prop CanRead bool -> this.baseStream.CanRead
    open override prop CanSeek bool -> this.baseStream.CanSeek
    open override prop Length int64 -> baseStreamLength
    open override prop CanWrite bool -> this.baseStream.CanWrite

    open override prop Position int64 {
        get -> if CanSeek {
            this.baseStream.Position
        } else {
            readPosition
        }
        set {
            if !CanSeek {
                throw NotSupportedException()
            }
            this.baseStream.Position = (readPosition = value)
        }
    }

    open override func Flush() {
        throw NotSupportedException()
    }

    open override func Read(buffer[]uint8, offset int32, count int32) int32 {
        this.baseStream.ReadExactly(buffer, offset, count)
        readPosition += int64(count)
        return count
    }

    open override func Seek(offset int64, origin SeekOrigin) int64 {
        return (
            readPosition = if CanSeek {
                this.baseStream.Seek(offset, origin)
            } else {
                throw NotSupportedException()
                default(int64)
            }
        )
    }

    open override func SetLength(value int64) -> this.baseStream.SetLength(value)

    open override func Write(buffer[]uint8, offset int32, count int32) -> this.baseStream.Write(buffer, offset, count)

    protected open override func Dispose(disposing bool) {
        if disposing {
            this.baseStream.Dispose()
        }
        base.Dispose(disposing)
    }
}
