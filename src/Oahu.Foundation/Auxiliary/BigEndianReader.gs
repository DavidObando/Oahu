package Oahu.Aux.Extensions

import System
import System.IO

// Note this MODIFIES THE GIVEN ARRAY then returns a reference to the modified array.
func (b[]uint8) Reverse()[]uint8 {
    Array.Reverse(b)
    return b
}

func (binRdr BinaryReader) ReadUInt16BE() uint16 {
    return BitConverter.ToUInt16(binRdr.ReadBytesRequired(2).Reverse(), 0)
}

func (binRdr BinaryReader) ReadInt16BE() int16 {
    return BitConverter.ToInt16(binRdr.ReadBytesRequired(2).Reverse(), 0)
}

func (binRdr BinaryReader) ReadUInt32BE() uint32 {
    return BitConverter.ToUInt32(binRdr.ReadBytesRequired(4).Reverse(), 0)
}

func (binRdr BinaryReader) ReadInt32BE() int32 {
    return BitConverter.ToInt32(binRdr.ReadBytesRequired(4).Reverse(), 0)
}

func (binRdr BinaryReader) ReadUInt64BE() uint64 {
    return BitConverter.ToUInt64(binRdr.ReadBytesRequired(8).Reverse(), 0)
}

func (binRdr BinaryReader) ReadInt64BE() int64 {
    return BitConverter.ToInt64(binRdr.ReadBytesRequired(8).Reverse(), 0)
}

func (binRdr BinaryReader) ReadBytesRequired(byteCount int32)[]uint8 {
    let result = binRdr.ReadBytes(byteCount)
    if result.Length != byteCount {
        throw EndOfStreamException(
            string.Format("{0} bytes required from stream, but only {1} returned.", byteCount, result.Length)
        )
    }
    return result
}
