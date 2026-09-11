package Oahu.Decrypt.FrameFilters.Audio

import Oahu.Decrypt.FrameFilters
import System

internal open class AacValidateFilter : FrameTransformBase[FrameEntry, FrameEntry] {
    protected open override prop InputBufferSize int32 -> 1000

    open override func PerformFiltering(input FrameEntry) FrameEntry {
        return if ValidateFrame(input.FrameData.Span) {
            input
        } else {
            throw Exception("Aac error!")
            default(FrameEntry)
        }
    }

    shared {
        private func ValidateFrame(frame ReadOnlySpan[uint8]) bool -> (AV_RB16(frame) & uint16(0xfff0)) != 0xfff0

        // Defined at
        // http://man.hubwiz.com/docset/FFmpeg.docset/Contents/Resources/Documents/api/intreadwrite_8h_source.html
        private func AV_RB16(frame ReadOnlySpan[uint8]) uint16 {
            return uint16((int32(frame[0]) << 8 | int32(frame[1])))
        }
    }
}
