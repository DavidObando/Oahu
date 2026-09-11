package Oahu.Decrypt.Mpeg4

import System
import System.IO

/// A write-only stream that tracks the stream position based on the number of bytes written.
open class TrackedWriteStream : Stream {
    private let baseStream Stream
    private var writePosition int64

    init(baseStream Stream, initialPosition int64 = 0) {
        this.baseStream = baseStream
        writePosition = initialPosition
    }

    open override prop CanRead bool -> false
    open override prop CanSeek bool -> this.baseStream.CanSeek
    open override prop Length int64 -> writePosition
    open override prop CanWrite bool -> this.baseStream.CanWrite

    open override prop Position int64 {
        get -> if CanSeek {
            this.baseStream.Position
        } else {
            writePosition
        }
        set {
            if !CanSeek {
                throw NotSupportedException()
            }
            this.baseStream.Position = value
        }
    }

    open override func Flush() -> this.baseStream.Flush()

    open override func Read(buffer[]uint8, offset int32, count int32) int32 {
        throw NotSupportedException()
    }

    open override func Seek(offset int64, origin SeekOrigin) int64 {
        return if CanSeek {
            this.baseStream.Seek(offset, origin)
        } else {
            throw NotSupportedException()
            default(int64)
        }
    }

    open override func SetLength(value int64) {
        throw NotSupportedException()
    }

    open override func Write(buffer[]uint8, offset int32, count int32) {
        this.baseStream.Write(buffer, offset, count)
        writePosition += int64(count)
    }

    protected open override func Dispose(disposing bool) {
        if disposing {
            this.baseStream.Dispose()
        }
        base.Dispose(disposing)
    }
}
