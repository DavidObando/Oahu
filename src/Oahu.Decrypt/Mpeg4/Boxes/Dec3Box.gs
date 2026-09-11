package Oahu.Decrypt.Mpeg4.Boxes

import Oahu.Decrypt.Mpeg4.Boxes.EC3SpecificBox
import Oahu.Decrypt.Mpeg4.Util
import System.Diagnostics
import System.IO
import System.Linq

/// EC3SpecificBox. ETSI TS 102 366 F.6
open class Dec3Box : Box {
    private let ec3Data[]uint8

    init(file Stream, header BoxHeader, parent IBox?) : base(header, parent) {
        ec3Data = file.ReadBlock(int32((header.TotalBoxSize - int64(header.HeaderSize))))
        let reader = BitReader(ec3Data)
        AverageBitrate = reader.Read(13) * uint32(1024)
        let num_ind_sub = reader.Read(3)
        Debug.Assert(num_ind_sub == uint32(0))
        IndependentSubstream = [int32(num_ind_sub + uint32(1))]Ec3IndependentSubstream
        for var i = 0;
        int64(i) <= int64(num_ind_sub);
        i++ {
            IndependentSubstream[i] = Ec3IndependentSubstream(reader)
        }
        let indSample = IndependentSubstream.First()
        Debug.Assert(indSample.NumDepSub == uint8(0))
        SampleRate = indSample.GetSampleRate()
        NumberOfChannels = indSample.ChannelCount()
        if reader.Length - reader.Position < 8 {
            return
        }
        // Dolby Atmos content carried by a Dolby Digital Plus stream.
        reader.Position += 7
        FlagEc3ExtensionTypeA = reader.ReadBool()
        if FlagEc3ExtensionTypeA!! {
            ComplexityIndexTypeA = uint8(reader.Read(8))
        }
    }

    open override prop RenderSize int64 -> base.RenderSize + int64(ec3Data.Length)

    /// ETSI TS 102 366 F.6.2.2 data_rate * 1024
    prop AverageBitrate uint32 {
        get;
        init;
    }

    prop SampleRate int32 {
        get;
        init;
    }

    prop NumberOfChannels int32 {
        get;
        init;
    }

    prop IndependentSubstream[]Ec3IndependentSubstream {
        get;
        init;
    }

    prop IsAtmos bool -> (FlagEc3ExtensionTypeA != nil)

    /// Signaling Dolby Digital Plus bitstreams with Dolby Atmos content in an ISO base media format file
    /// Having a value indicates that audio is Dolby Atmos
    /// whether ComplexityIndexTypeA is available in the E-AC-3 descriptor.
    prop FlagEc3ExtensionTypeA bool? {
        get;
        init;
    }

    /// Dolby Digital Plus bitstream structure
    /// takes a value of 1 to 16 that indicates the decoding complexity of the Dolby Atmos bitstream
    prop ComplexityIndexTypeA uint8? {
        get;
        init;
    }

    protected open override func Render(file Stream) {
        file.Write(ec3Data)
    }
}
