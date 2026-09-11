package Oahu.Decrypt.Mpeg4.ID3

import System.IO

internal class TagFactory {
    shared {
        func CreateTag(file Stream, parent Frame, out lengthRead int32) Frame {
            let startPos = file.Position
            let frameHeader = FrameHeader.Create(file, parent.Version)
            let frame = CreateTagInternal(frameHeader, file, parent)
            lengthRead = int32((file.Position - startPos))
            return frame
        }

        private func CreateTagInternal(frameHeader FrameHeader, file Stream, parent Frame) Frame {
            if parent.Version >= uint16(0x300) && frameHeader.Identifier.StartsWith('T') &&
                frameHeader.Identifier != "TXXX" {
                return TEXTFrame(file, frameHeader, parent)
            }
            return switch frameHeader.Identifier {
                case "TXXX": cast[Frame](TXXXFrame(file, frameHeader, parent))
                case "APIC": cast[Frame](APICFrame(file, frameHeader, parent))
                case "CHAP": cast[Frame](CHAPFrame(file, frameHeader, parent))
                case "CTOC": cast[Frame](CTOCFrame(file, frameHeader, parent))
                case "\u0000\u0000\u0000" or "\u0000\u0000\u0000\u0000": cast[Frame](EmptyFrame(frameHeader, parent))
                default: cast[Frame](UnknownFrame(file, frameHeader, parent))
            }
        }
    }
}
