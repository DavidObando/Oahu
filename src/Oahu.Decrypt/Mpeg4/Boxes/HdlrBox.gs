package Oahu.Decrypt.Mpeg4.Boxes

import Oahu.Decrypt.Mpeg4.Util
import System
import System.IO
import System.Text

open class HdlrBox : FullBox {
    private let reserved[]uint8

    init(file Stream, header BoxHeader, parent IBox?) : base(file, header, parent) {
        let endPos = Header.FilePosition + Header.TotalBoxSize
        PreDefined = file.ReadUInt32BE()
        HandlerType = Encoding.UTF8.GetString(file.ReadBlock(4))
        reserved = file.ReadBlock(12)
        let readToEnd = file.ReadBlock(int32((endPos - file.Position)))
        for var i = readToEnd.Length - 1; i >= 0 && readToEnd[i] == uint8(0); i-- {
            NullTerminatorCount++
        }
        HandlerName = Encoding.UTF8.GetString(readToEnd, 0, readToEnd.Length - NullTerminatorCount)
    }

    private init(type string, name string?, parent IBox) : base(
        []uint8{uint8(0), uint8(0), uint8(0), uint8(0)},
        BoxHeader(8, "hdlr"),
        parent
    ) {
        ArgumentException.ThrowIfNullOrEmpty(type, "type")
        if Encoding.UTF8.GetByteCount(type) != 4 {
            throw ArgumentException("Type '$type' must be exactly 4 UTF-8 characters long.", "type")
        }
        HandlerType = type
        reserved = [12]uint8
        HandlerName = name ?? ""
        NullTerminatorCount = 1
    }

    prop NullTerminatorCount int32
    open override prop RenderSize int64 -> base.RenderSize +
        int64(20) +
        int64(Encoding.UTF8.GetByteCount(HandlerName)) +
        int64(NullTerminatorCount)

    prop PreDefined uint32 {
        get;
        init;
    }

    prop HandlerType string {
        get;
        init;
    }

    prop HandlerName string

    protected open override func Render(file Stream) {
        base.Render(file)
        file.WriteUInt32BE(PreDefined)
        file.Write(Encoding.UTF8.GetBytes(HandlerType))
        file.Write(reserved)
        file.Write(Encoding.UTF8.GetBytes(HandlerName))
        file.Write([NullTerminatorCount]uint8)
    }

    shared {
        func Create(type string, name string?, reservedData[]uint8, parent IBox) HdlrBox {
            ArgumentNullException.ThrowIfNull(reservedData, "reservedData")
            ArgumentNullException.ThrowIfNull(parent, "parent")
            ArgumentOutOfRangeException.ThrowIfGreaterThan(reservedData.Length, 12, "reservedData")
            let hdlr = HdlrBox(type, name, parent)
            Array.Copy(reservedData, 0, hdlr.reserved, 0, reservedData.Length)
            parent.Children.Add(hdlr)
            return hdlr
        }
    }
}
