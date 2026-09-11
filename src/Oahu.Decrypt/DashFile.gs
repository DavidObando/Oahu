package Oahu.Decrypt

import Oahu.Decrypt.Chunks
import Oahu.Decrypt.FrameFilters
import Oahu.Decrypt.FrameFilters.Audio
import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Util
import System
import System.Buffers
import System.IO
import System.Linq

open class DashFile : Mp4File {
    convenience init(fileName string, access FileAccess = FileAccess.Read, share FileShare = FileShare.Read) {
        init(File.Open(fileName, FileMode.Open, access, share))
    }

    convenience init(file Stream) {
        init(file, file.Length)
    }

    init(file Stream, fileLength int64) : base(file, fileLength) {
        if FileType != FileType.Dash {
            throw ArgumentException("This instance of ${"Mp4File"} is not a Dash file.")
        }
        FirstMoof = TopLevelBoxes.OfType[MoofBox]().Single()
        let audioSampleEntry = Moov
            .AudioTrack
            .Mdia
            .Minf
            .Stbl
            .Stsd
            .AudioSampleEntry ?? throw InvalidDataException("The audio track doesn't contain an ${"AudioSampleEntry"}")
        if audioSampleEntry.GetChild[SinfBox]() is {} sinf {
            if sinf.SchemeType?.Type != SchmBox.SchemeType.Cenc {
                throw NotSupportedException("Only ${"Cenc"} dash files are currently supported.")
            }
            Tenc = sinf.SchemeInformation?.TrackEncryption
            audioSampleEntry.Children.Remove(sinf)
            audioSampleEntry.Header.ChangeAtomName(sinf.OriginalFormat.DataFormat)
        }
        for pssh in Moov.GetChildren[PsshBox]().ToArray() {
            Moov.Children.Remove(pssh)
        }
        if AudioSampleEntry.Dec3 != nil || AudioSampleEntry.Dac4 != nil {
            Ftyp = FtypBox.Create("mp42", 0)
            Ftyp.CompatibleBrands.Add("dby1")
            Ftyp.CompatibleBrands.Add("iso8")
            Ftyp.CompatibleBrands.Add("isom")
            Ftyp.CompatibleBrands.Add("mp41")
            Ftyp.CompatibleBrands.Add("M4A ")
            Ftyp.CompatibleBrands.Add("M4B ")
        } else {
            Ftyp = FtypBox.Create("isom", 0x200)
            Ftyp.CompatibleBrands.Add("iso2")
            Ftyp.CompatibleBrands.Add("mp41")
            Ftyp.CompatibleBrands.Add("M4A ")
            Ftyp.CompatibleBrands.Add("M4B ")
        }
    }

    prop FirstMoof MoofBox {
        get;
        init;
    }

    prop FirstMdat MdatBox -> Mdat
    prop Sidx SidxBox -> TopLevelBoxes.OfType[SidxBox]().Single()

    open override prop Duration TimeSpan -> TimeSpan.FromSeconds(
        float64(Moov.GetChildOrThrow[MvexBox]().GetChildOrThrow[MehdBox]().FragmentDuration) / float64(TimeScale)
    )

    prop Tenc TencBox? {
        get;
        init;
    }

    prop Key[]?uint8 {
        get;
        private set;
    }

    private prop Mdat MdatBox -> base.Mdat

    func SetDecryptionKey(keyId string, decryptionKey string) {
        if string.IsNullOrWhiteSpace(keyId) || keyId.Length != AesCtr.AesBlockSize * 2 {
            throw ArgumentException("${"keyId"} must be ${AesCtr.AesBlockSize} bytes long.")
        }
        if string.IsNullOrWhiteSpace(decryptionKey) || decryptionKey.Length != AesCtr.AesBlockSize * 2 {
            throw ArgumentException("${"decryptionKey"} must be ${AesCtr.AesBlockSize} bytes long.")
        }
        let keyIdBts = Convert.FromHexString(keyId)
        let decryptionKeyBts = Convert.FromHexString(decryptionKey)
        SetDecryptionKey(keyIdBts, decryptionKeyBts)
    }

    open override func GetAudioFrameFilter() FrameTransformBase[FrameEntry, FrameEntry] {
        return if Key == nil && Tenc != nil {
            throw InvalidOperationException("This instance of ${"DashFile"} does not have a decryption key set.")
            default(DashFilter)
        } else {
            DashFilter(Key)
        }
    }

    func SetDecryptionKey(keyId[]?uint8, decryptionKey[]?uint8) {
        if Tenc == nil {
            throw InvalidOperationException("This instance of ${"DashFile"} does not contain a ${"TencBox"}.")
        }
        if keyId == nil || keyId.Length != AesCtr.AesBlockSize {
            throw ArgumentException("${"keyId"} must be ${AesCtr.AesBlockSize} bytes long.")
        }
        if decryptionKey == nil || decryptionKey.Length != AesCtr.AesBlockSize {
            throw ArgumentException("${"decryptionKey"} must be ${AesCtr.AesBlockSize} bytes long.")
        }
        let keyUUID = Guid(keyId, bigEndian: true)
        if keyUUID != Tenc!!.DefaultKID {
            throw InvalidOperationException(
                "Supplied keyId does not match dash default keyId: ${Convert.ToHexString(Tenc!!.DefaultKID.ToByteArray(bigEndian: true))}"
            )
        }
        Key = decryptionKey
    }

    protected open override func CalculateBitrate() uint32 {
        let totalSize = Sidx.Segments.Sum((s SidxBox.Segment) -> int64(s.ReferenceSize)) * int64(8)
        let totalDuration = Sidx.Segments.Sum((s SidxBox.Segment) -> int64(s.SubsegmentDuration))
        let bitRate = totalSize * int64(Sidx.Timescale) / totalDuration
        return uint32(bitRate)
    }

    protected open override func CreateChunkReader(
        inputStream Stream,
        startTime TimeSpan,
        endTime TimeSpan
    ) IChunkReader -> DashChunkReader(this, inputStream, startTime, endTime)
}
