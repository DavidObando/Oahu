package Oahu.Decrypt.Mpeg4

import Oahu.Decrypt.Mpeg4.Boxes
import System.Buffers.Binary
import System.IO

class MetadataItems {
    init(appleListBox AppleListBox) {
        AppleListBox = appleListBox
    }

    prop AppleListBox AppleListBox {
        get;
        init;
    }

    prop FirstAuthor string? -> Artist?.Split(';')[0]
    prop TitleSansUnabridged string? -> Title?.Replace(" (Unabridged)", "")
    prop BookCopyright string? -> if GetCopyrights() is {} copyrights && copyrights.Length > 0 {
        copyrights[0]
    } else {
        default(string?)
    }
    prop RecordingCopyright string? -> if GetCopyrights() is {} copyrights && copyrights.Length > 1 {
        copyrights[1]
    } else {
        default(string?)
    }

    prop Title string? {
        get -> AppleListBox.GetTagString(TagNameTitle)
        set -> AppleListBox.EditOrAddTag(TagNameTitle, value)
    }

    prop Producer string? {
        get -> AppleListBox.GetTagString(TagNameProducer)
        set -> AppleListBox.EditOrAddTag(TagNameProducer, value)
    }

    prop Artist string? {
        get -> AppleListBox.GetTagString(TagNameArtist)
        set -> AppleListBox.EditOrAddTag(TagNameArtist, value)
    }

    prop AlbumArtists string? {
        get -> AppleListBox.GetTagString(TagNameAlbumArtist)
        set -> AppleListBox.EditOrAddTag(TagNameAlbumArtist, value)
    }

    prop Album string? {
        get -> AppleListBox.GetTagString(TagNameAlbum)
        set -> AppleListBox.EditOrAddTag(TagNameAlbum, value)
    }

    prop Genres string? {
        get -> AppleListBox.GetTagString(TagNameGenres)
        set -> AppleListBox.EditOrAddTag(TagNameGenres, value)
    }

    prop ProductID string? {
        get -> AppleListBox.GetTagString(TagNameProductId)
        set -> AppleListBox.EditOrAddTag(TagNameProductId, value)
    }

    prop Comment string? {
        get -> AppleListBox.GetTagString(TagNameComment)
        set -> AppleListBox.EditOrAddTag(TagNameComment, value)
    }

    prop LongDescription string? {
        get -> AppleListBox.GetTagString(TagNameLongDescription)
        set -> AppleListBox.EditOrAddTag(TagNameLongDescription, value)
    }

    prop Copyright string? {
        get -> AppleListBox.GetTagString(TagNameCopyright)
        set -> AppleListBox.EditOrAddTag(TagNameCopyright, value)
    }

    prop Publisher string? {
        get -> AppleListBox.GetTagString(TagNamePublisher)
        set -> AppleListBox.EditOrAddTag(TagNamePublisher, value)
    }

    prop Year string? {
        get -> AppleListBox.GetTagString(TagNameYear)
        set -> AppleListBox.EditOrAddTag(TagNameYear, value)
    }

    prop Narrator string? {
        get -> AppleListBox.GetTagString(TagNameNarrator)
        set -> AppleListBox.EditOrAddTag(TagNameNarrator, value)
    }

    prop Asin string? {
        get -> AppleListBox.GetTagString(TagNameAsin)
        set -> AppleListBox.EditOrAddTag(TagNameAsin, value)
    }

    prop ReleaseDate string? {
        get -> AppleListBox.GetTagString(TagNameReleaseDate)
        set -> AppleListBox.EditOrAddTag(TagNameReleaseDate, value)
    }

    prop Acr string? {
        get -> AppleListBox.GetTagString(TagNameAcr)
        set -> AppleListBox.EditOrAddTag(TagNameAcr, value)
    }

    prop Version string? {
        get -> AppleListBox.GetTagString(TagNameVersion)
        set -> AppleListBox.EditOrAddTag(TagNameVersion, value)
    }

    prop Encoder string? {
        get -> AppleListBox.GetTagString(TagNameEncoder)
        set -> AppleListBox.EditOrAddTag(TagNameEncoder, value)
    }

    prop Cover[]?uint8 {
        get -> AppleListBox.GetTagBox(TagNameCover)?.Data.Data
        set -> SetCoverArt(value)
    }

    prop CoverFormat AppleDataType? -> AppleListBox.GetTagBox(TagNameCover)?.Data.DataType

    prop TrackNumber TrackNumber? {
        get -> AppleListBox.GetTagData[TrackNumber](TagNameTrackNumber)
        set -> AppleListBox.EditOrAddTag(TagNameTrackNumber, value)
    }

    prop DiskNumber DiskNumber? {
        get -> AppleListBox.GetTagData[DiskNumber](TagNameDiskNumber)
        set -> AppleListBox.EditOrAddTag(TagNameDiskNumber, value)
    }

    private func GetCopyrights()[]?string -> Copyright?.Replace("&#169;", "©")?.Split(';')

    private func SetCoverArt(coverArtBytes[]?uint8) {
        let EditOrAdd = func (dataType AppleDataType) {
            if AppleListBox.GetTagBox(TagNameCover) is {} tagBox && tagBox.Data.DataType != dataType {
                // Allow changing data type by removing and re-adding
                AppleListBox.RemoveTag(tagBox)
                tagBox.Dispose()
            }
            AppleListBox.EditOrAddTag(TagNameCover, coverArtBytes, dataType)
        }
        if coverArtBytes == nil {
            AppleListBox.RemoveTag(TagNameCover)
        } else if coverArtBytes.Length >= 2 && BinaryPrimitives.ReadInt16LittleEndian(coverArtBytes) == int16(0x4D42) {
            EditOrAdd(AppleDataType.BMP)
        } else if coverArtBytes.Length >= 3 &&
            (BinaryPrimitives.ReadInt32LittleEndian(coverArtBytes) & 0xFFFFFF) == 0xFFD8FF {
            EditOrAdd(AppleDataType.JPEG)
        } else if coverArtBytes.Length >= 8 && BinaryPrimitives.ReadInt64LittleEndian(
            coverArtBytes
        ) == 0xA1A0A0D474e5089L {
            EditOrAdd(AppleDataType.PNG)
        } else {
            throw InvalidDataException("Image data is not a jpeg, PNG, or windows bitmap.")
        }
    }

    shared {
        const TagNameTitle string = "©nam"
        const TagNameProducer string = "©prd"
        const TagNameArtist string = "©ART"
        const TagNameAlbumArtist string = "aART"
        const TagNameAlbum string = "©alb"
        const TagNameGenres string = "©gen"
        const TagNameProductId string = "prID"
        const TagNameComment string = "©cmt"
        const TagNameLongDescription string = "©des"
        const TagNameCopyright string = "cprt"
        const TagNamePublisher string = "©pub"
        const TagNameYear string = "©day"
        const TagNameNarrator string = "©nrt"
        const TagNameAsin string = "CDEK"
        const TagNameReleaseDate string = "rldt"
        const TagNameAcr string = "AACR"
        const TagNameVersion string = "VERS"
        const TagNameEncoder string = "©too"
        const TagNameCover string = "covr"
        const TagNameTrackNumber string = "trkn"
        const TagNameDiskNumber string = "disk"

        func FromFile(mp4File string) MetadataItems? {
            using let file = File.Open(mp4File, FileMode.Open, FileAccess.Read, FileShare.Read)
            var header BoxHeader
            do {
                header = BoxHeader(file)
                if header.Type == "moov" {
                    continue
                } else if header.Type == "udta" {
                    break
                } else {
                    file.Position += header.TotalBoxSize - int64(header.HeaderSize)
                }
            } while file.Position < file.Length
            return if header?.Type == "udta" && UdtaBox(file, header, nil)?.GetChild[MetaBox]()
                ?.GetChild[AppleListBox]() is {} ilst {
                MetadataItems(ilst)
            } else {
                default(MetadataItems?)
            }
        }
    }
}
