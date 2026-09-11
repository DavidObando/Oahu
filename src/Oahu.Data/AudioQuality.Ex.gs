package Oahu.BooksDatabase.Ex

import Oahu.BooksDatabase
import Oahu.CommonTypes
import System

class ExCodec {
    shared {
        func TryParseCodec(format string?, out codec ECodec) bool {
            if format == nil {
                codec = default(ECodec)
                return false
            }
            // Handle API format with underscores (e.g., "aax_22_32")
            let normalized = format.Replace("_", string.Empty)
            return Enum.TryParse[ECodec](normalized, true, out codec)
        }
    }
}

func (codec Codec) ToQuality() AudioQuality? -> codec.Name.ToQuality()

func extension(codec ECodec) ToQuality() AudioQuality? {
    return switch codec {
        case ECodec.Aax2232: AudioQuality(22050, 32)
        case ECodec.Aax2264: AudioQuality(22050, 64)
        case ECodec.Aax4464: AudioQuality(44100, 64)
        case ECodec.Aax44128: AudioQuality(44100, 128)
        default: default(AudioQuality?)
    }
}
