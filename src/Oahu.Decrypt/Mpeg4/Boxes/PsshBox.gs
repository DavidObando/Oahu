package Oahu.Decrypt.Mpeg4.Boxes

import Oahu.Decrypt.Mpeg4.Util
import System
import System.IO

open class PsshBox : FullBox {
    init(file Stream, header BoxHeader, parent IBox?) : base(file, header, parent) {
        ProtectionSystemId = Guid(file.ReadBlock(16), bigEndian: true)
        let initDataSize = file.ReadInt32BE()
        InitData = file.ReadBlock(initDataSize)
        let remaining = int32(
            (header.TotalBoxSize - int64(header.HeaderSize) - int64(4) - int64(16) - int64(4) - int64(initDataSize))
        )
        ExtraData = file.ReadBlock(remaining)
    }

    open override prop RenderSize int64 -> base.RenderSize +
        int64(16) +
        int64(4) +
        int64(InitData.Length) +
        int64(ExtraData.Length)

    prop ProtectionSystemId Guid {
        get;
        init;
    }

    prop InitData[]uint8 {
        get;
        init;
    }

    prop ExtraData[]uint8 {
        get;
        init;
    }

    protected open override func Render(file Stream) {
        base.Render(file)
        file.Write(ProtectionSystemId.ToByteArray(bigEndian: true))
        file.WriteInt32BE(InitData.Length)
        file.Write(InitData)
        file.Write(ExtraData)
    }
}
