package Oahu.Decrypt.Mpeg4.Boxes

import Oahu.Decrypt.Mpeg4.Util
import System
import System.IO

open class HeaderBox : FullBox {
    init(file Stream, header BoxHeader, parent IBox?) : base(file, header, parent) {
        if Version == uint8(0) {
            CreationTime = Datum.AddSeconds(file.ReadUInt32BE())
            ModificationTime = Datum.AddSeconds(file.ReadUInt32BE())
            ReadBeforeDuration(file)
            Duration = file.ReadUInt32BE()
        } else {
            CreationTime = Datum.AddSeconds(file.ReadUInt64BE())
            ModificationTime = Datum.AddSeconds(file.ReadUInt64BE())
            ReadBeforeDuration(file)
            Duration = file.ReadUInt64BE()
        }
    }

    open override prop RenderSize int64 -> base.RenderSize +
        int64(
        3 * (
            if RequireVersionOne {
                8
            } else {
                4
            }
        )
    )
    prop CreationTime DateTimeOffset
    prop ModificationTime DateTimeOffset
    prop Duration uint64
    private prop RequireVersionOne bool -> Version == uint8(1) || Duration > uint64(uint32.MaxValue)

    protected open func ReadBeforeDuration(file Stream);

    protected open func WriteBeforeDuration(file Stream);

    protected open override func Render(file Stream) {
        if RequireVersionOne {
            // Even if we don't need a version 1 box, preserve files which are already version 1
            Version = uint8(1)
            base.Render(file)
            file.WriteUInt64BE(uint64((CreationTime - Datum).TotalSeconds))
            file.WriteUInt64BE(uint64((ModificationTime - Datum).TotalSeconds))
            WriteBeforeDuration(file)
            file.WriteUInt64BE(Duration)
        } else {
            base.Render(file)
            file.WriteUInt32BE(uint32((CreationTime - Datum).TotalSeconds))
            file.WriteUInt32BE(uint32((ModificationTime - Datum).TotalSeconds))
            WriteBeforeDuration(file)
            file.WriteUInt32BE(uint32(Duration))
        }
    }

    shared {
        private let Datum DateTimeOffset = DateTimeOffset(1904, 1, 1, 0, 0, 0, TimeSpan.Zero)
    }
}
