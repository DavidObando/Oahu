package Oahu.Decrypt.Mpeg4.Descriptors

import Oahu.Decrypt.Mpeg4.Util
import System.IO

// ES_Descriptor ISO/IEC 14496-1 Section 7.2.6.5 (pp 35)
// https://stackoverflow.com/a/61158659/3335599
class ES_Descriptor : BaseDescriptor {
    private let esFlags uint8
    private let dependsOnEsId uint16
    private let urlLength uint8
    private let urlString[]?uint8
    private let ocrEsId uint16

    init(file Stream, header DescriptorHeader) : base(file, header) {
        EsId = file.ReadUInt16BE()
        esFlags = uint8(file.ReadByte())
        if StreamDependenceFlag == 1 {
            dependsOnEsId = file.ReadUInt16BE()
        }
        if UrlFlag == 1 {
            urlLength = uint8(file.ReadByte())
            urlString = file.ReadBlock(urlLength)
        }
        if OcrStreamFlag == 1 {
            ocrEsId = file.ReadUInt16BE()
        }
        // Currently only supported child is DecoderConfigDescriptor.
        // Any additional children will be loaded as UnknownDescriptor
        LoadChildren(file)
    }

    private init() : base(0x3) {
        EsId = uint16(0)
        esFlags = uint8(0)
    }

    prop EsId uint16 {
        get;
        init;
    }

    prop StreamPriority int32 -> esFlags & uint8(31)
    prop DecoderConfig DecoderConfigDescriptor -> GetChildOrThrow[DecoderConfigDescriptor]()
    override prop InternalSize int32 -> base.InternalSize + GetLength()
    private prop StreamDependenceFlag int32 -> int32(esFlags) >> 7
    private prop UrlFlag int32 -> (int32(esFlags) >> 6) & 1
    private prop OcrStreamFlag int32 -> (int32(esFlags) >> 5) & 1

    override func Render(file Stream) {
        file.WriteUInt16BE(EsId)
        file.WriteByte(esFlags)
        if StreamDependenceFlag == 1 {
            file.WriteUInt16BE(dependsOnEsId)
        }
        if UrlFlag == 1 {
            file.WriteByte(urlLength)
            file.Write(urlString)
        }
        if OcrStreamFlag == 1 {
            file.WriteUInt16BE(ocrEsId)
        }
    }

    private func GetLength() int32 {
        var length = 3
        if StreamDependenceFlag == 1 {
            length += 2
        }
        if UrlFlag == 1 {
            length += uint8(1) + urlLength
        }
        if OcrStreamFlag == 1 {
            length += 2
        }
        return length
    }

    shared {
        func CreateAudio() ES_Descriptor {
            let descriptor = ES_Descriptor()
            let decoder = DecoderConfigDescriptor.CreateAudio()
            let slConfig = SLConfigDescriptor.CreateMp4()
            descriptor.Children.Add(decoder)
            descriptor.Children.Add(slConfig)
            return descriptor
        }
    }
}
