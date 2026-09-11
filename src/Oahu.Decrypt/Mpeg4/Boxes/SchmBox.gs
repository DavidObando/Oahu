package Oahu.Decrypt.Mpeg4.Boxes

import Oahu.Decrypt.Mpeg4.Util
import System.Collections.Generic
import System.IO
import System.Text

open class SchmBox : FullBox {
    init(file Stream, header BoxHeader, parent IBox?) : base(file, header, parent) {
        let endPos = Header.FilePosition + Header.TotalBoxSize
        Type = SchemeType(file.ReadUInt32BE())
        SchemeVersion = file.ReadUInt32BE()
        if (Flags & 1) == 1 {
            let blist = List[uint8]()
            while file.Position < endPos {
                let lastByte = uint8(file.ReadByte())
                if lastByte == uint8(0) {
                    HasNullTerminator = true
                    break
                }
                blist.Add(lastByte)
            }
            SchemeUri = Encoding.UTF8.GetString(blist.ToArray())
        }
    }

    enum SchemeType {
        Unknown,
        Cenc = 1667591779,
        Cbc1 = 1667392305,
        Cens = 1667591795,
        Cbcs = 1667392371
    }
    open override prop RenderSize int64 -> base.RenderSize +
        int64(8) +
        int64(
        (
            if (Flags & 1) == 1 && SchemeUri is string uri {
                Encoding.UTF8.GetByteCount(uri) +
                    (
                    if HasNullTerminator {
                        1
                    } else {
                        0
                    }
                )
            } else {
                0
            }
        )
    )
    prop HasNullTerminator bool

    prop Type SchemeType {
        get;
        init;
    }

    prop SchemeVersion uint32 {
        get;
        init;
    }

    prop SchemeUri string? {
        get;
        init;
    }

    protected open override func Render(file Stream) {
        base.Render(file)
        file.WriteUInt32BE(uint32(Type))
        file.WriteUInt32BE(SchemeVersion)
        if (Flags & 1) == 1 && SchemeUri is string uri {
            file.Write(Encoding.UTF8.GetBytes(uri))
            if HasNullTerminator {
                file.WriteByte(0)
            }
        }
    }
}
