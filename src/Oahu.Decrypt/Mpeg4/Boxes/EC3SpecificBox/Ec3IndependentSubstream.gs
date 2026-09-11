package Oahu.Decrypt.Mpeg4.Boxes.EC3SpecificBox

import Oahu.Decrypt.Mpeg4.Util
import System.IO

/// Part of the EC3SpecificBox. Represents an independent substream in E-AC-3.
/// ETSI TS 102 366 F.6
class Ec3IndependentSubstream {
    /// ETSI TS 102 366 4.4.1.3 fscod - Sample rate code - 2 bits
    /// Table 4.1: Sample rate codes
    var Fscod uint8

    /// ETSI TS 102 366 4.4.2.1 bsid - Bit stream identification
    var Bsid uint8

    /// ETSI TS 102 366 F.6.2.7 asvc - is a main audio service
    /// Value must be 16 for E-AC-3 (E.1.1 Indication of Enhanced AC-3 bit stream syntax)
    var Asvc bool

    /// ETSI TS 102 366 4.4.2.2 bsmod - Bit stream mode - 3 bits
    /// Table 4.2: Bit stream mode
    var Bsmod uint8

    /// ETSI TS 102 366 4.4.2.3 acmod - Audio coding mode
    var Acmod AudioCodingMode

    /// ETSI TS 102 366 4.4.2.7 lfeon - Low frequency effects channel on
    var Lfeon bool

    /// ETSI TS 102 366 F.6.2.12 num_dep_sub
    var NumDepSub uint8

    /// ETSI TS 102 366 F.6.2.13 chan_loc - channel locations
    var ChanLoc ChannelLocation

    init(reader BitReader) {
        Fscod = uint8(reader.Read(2))
        Bsid = uint8(reader.Read(5))
        if Bsid != uint8(16) {
            throw InvalidDataException("Invalid bsid value: $Bsid. Expected 16 for E-AC-3.")
        }
        reader.Position += 1
        Asvc = reader.ReadBool()
        Bsmod = uint8(reader.Read(3))
        Acmod = AudioCodingMode(reader.Read(3))
        Lfeon = reader.Read(1) > uint32(0)
        reader.Position += 3
        let numDepSub = reader.Read(4)
        if numDepSub > uint32(0) {
            ChanLoc = ChannelLocation(reader.Read(9))
        } else {
            reader.Position++
        }
    }

    func GetSampleRate() int32 {
        var indSub = this
        return if indSub.Fscod == uint8(0) {
            48000
        } else {
            (
                if indSub.Fscod == uint8(1) {
                    44100
                } else {
                    (
                        if indSub.Fscod == uint8(2) {
                            32000
                        } else {
                            throw InvalidDataException("${"Fscod"} value of ${indSub.Fscod} is not valid")
                            default(int32)
                        }
                    )
                }
            )
        }
    }

    func ChannelCount() int32 {
        var indSub = this
        return int32(Ec3Extensions.FfAc3ChannelsTab[uint8(indSub.Acmod)]) +
            (
            if indSub.Lfeon {
                1
            } else {
                0
            }
        )
    }
}
