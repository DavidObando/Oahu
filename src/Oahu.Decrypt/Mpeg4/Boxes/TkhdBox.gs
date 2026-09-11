package Oahu.Decrypt.Mpeg4.Boxes

import Oahu.Decrypt.Mpeg4.Util
import System.IO

open class TkhdBox : HeaderBox {
    init(file Stream, header BoxHeader, parent IBox?) : base(file, header, parent) {
        let _ = file.ReadUInt64BE() // Reserved2
        Layer = file.ReadInt16BE()
        AlternateGroup = file.ReadInt16BE()
        Volume = file.ReadInt16BE()
        Reserved3 = file.ReadUInt16BE()
        Matrix = file.ReadBlock(4 * 9)
        Width = file.ReadUInt32BE()
        Height = file.ReadUInt32BE()
    }

    open override prop RenderSize int64 -> base.RenderSize +
        int64(2 * 4) +
        int64(8) +
        int64(4 * 2) +
        int64(Matrix.Length) +
        int64(2 * 4)
    prop TrackID uint32

    prop Layer int16 {
        get;
        init;
    }

    prop AlternateGroup int16

    prop Volume int16 {
        get;
        init;
    }

    prop Reserved3 uint16 {
        get;
        init;
    }

    prop Matrix[]uint8 {
        get;
        init;
    }

    prop Width uint32 {
        get;
        init;
    }

    prop Height uint32 {
        get;
        init;
    }

    protected open override func Render(file Stream) {
        base.Render(file)
        file.WriteUInt64BE(0) // Reserved2
        file.WriteInt16BE(Layer)
        file.WriteInt16BE(AlternateGroup)
        file.WriteInt16BE(Volume)
        file.WriteUInt16BE(Reserved3)
        file.Write(Matrix)
        file.WriteUInt32BE(Width)
        file.WriteUInt32BE(Height)
    }

    protected open override func ReadBeforeDuration(file Stream) {
        TrackID = file.ReadUInt32BE()
        let _ = file.ReadUInt32BE() // Reserved

    }

    protected open override func WriteBeforeDuration(file Stream) {
        file.WriteUInt32BE(TrackID)
        file.WriteUInt32BE(0) // Reserved

    }
}
