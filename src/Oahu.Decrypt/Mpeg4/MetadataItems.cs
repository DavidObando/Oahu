using System.Buffers.Binary;
using System.IO;
using Oahu.Decrypt.Mpeg4.Boxes;

namespace Oahu.Decrypt.Mpeg4;

public class MetadataItems
{
  public const string TagNameTitle = "©nam";
  public const string TagNameProducer = "©prd";
  public const string TagNameArtist = "©ART";
  public const string TagNameAlbumArtist = "aART";
  public const string TagNameAlbum = "©alb";
  public const string TagNameGenres = "©gen";
  public const string TagNameProductId = "prID";
  public const string TagNameComment = "©cmt";
  public const string TagNameLongDescription = "©des";
  public const string TagNameCopyright = "cprt";
  public const string TagNamePublisher = "©pub";
  public const string TagNameYear = "©day";
  public const string TagNameNarrator = "©nrt";
  public const string TagNameAsin = "CDEK";
  public const string TagNameReleaseDate = "rldt";
  public const string TagNameAcr = "AACR";
  public const string TagNameVersion = "VERS";
  public const string TagNameEncoder = "©too";
  public const string TagNameCover = "covr";
  public const string TagNameTrackNumber = "trkn";
  public const string TagNameDiskNumber = "disk";

  public MetadataItems(AppleListBox appleListBox)
  {
    AppleListBox = appleListBox;
  }

  public AppleListBox AppleListBox { get; }

  public string? FirstAuthor => Artist?.Split(';')?[0];

  public string? TitleSansUnabridged => Title?.Replace(" (Unabridged)", "");

  public string? BookCopyright => GetCopyrights() is { } copyrights && copyrights.Length > 0 ? copyrights[0] : default;

  public string? RecordingCopyright => GetCopyrights() is { } copyrights && copyrights.Length > 1 ? copyrights[1] : default;

  public string? Title { get => AppleListBox.GetTagString(TagNameTitle); set => AppleListBox.EditOrAddTag(TagNameTitle, value); }

  public string? Producer { get => AppleListBox.GetTagString(TagNameProducer); set => AppleListBox.EditOrAddTag(TagNameProducer, value); }

  public string? Artist { get => AppleListBox.GetTagString(TagNameArtist); set => AppleListBox.EditOrAddTag(TagNameArtist, value); }

  public string? AlbumArtists { get => AppleListBox.GetTagString(TagNameAlbumArtist); set => AppleListBox.EditOrAddTag(TagNameAlbumArtist, value); }

  public string? Album { get => AppleListBox.GetTagString(TagNameAlbum); set => AppleListBox.EditOrAddTag(TagNameAlbum, value); }

  public string? Genres { get => AppleListBox.GetTagString(TagNameGenres); set => AppleListBox.EditOrAddTag(TagNameGenres, value); }

  public string? ProductID { get => AppleListBox.GetTagString(TagNameProductId); set => AppleListBox.EditOrAddTag(TagNameProductId, value); }

  public string? Comment { get => AppleListBox.GetTagString(TagNameComment); set => AppleListBox.EditOrAddTag(TagNameComment, value); }

  public string? LongDescription { get => AppleListBox.GetTagString(TagNameLongDescription); set => AppleListBox.EditOrAddTag(TagNameLongDescription, value); }

  public string? Copyright { get => AppleListBox.GetTagString(TagNameCopyright); set => AppleListBox.EditOrAddTag(TagNameCopyright, value); }

  public string? Publisher { get => AppleListBox.GetTagString(TagNamePublisher); set => AppleListBox.EditOrAddTag(TagNamePublisher, value); }

  public string? Year { get => AppleListBox.GetTagString(TagNameYear); set => AppleListBox.EditOrAddTag(TagNameYear, value); }

  public string? Narrator { get => AppleListBox.GetTagString(TagNameNarrator); set => AppleListBox.EditOrAddTag(TagNameNarrator, value); }

  public string? Asin { get => AppleListBox.GetTagString(TagNameAsin); set => AppleListBox.EditOrAddTag(TagNameAsin, value); }

  public string? ReleaseDate { get => AppleListBox.GetTagString(TagNameReleaseDate); set => AppleListBox.EditOrAddTag(TagNameReleaseDate, value); }

  public string? Acr { get => AppleListBox.GetTagString(TagNameAcr); set => AppleListBox.EditOrAddTag(TagNameAcr, value); }

  public string? Version { get => AppleListBox.GetTagString(TagNameVersion); set => AppleListBox.EditOrAddTag(TagNameVersion, value); }

  public string? Encoder { get => AppleListBox.GetTagString(TagNameEncoder); set => AppleListBox.EditOrAddTag(TagNameEncoder, value); }

  public byte[]? Cover { get => AppleListBox.GetTagBox(TagNameCover)?.Data.Data; set => SetCoverArt(value); }

  public AppleDataType? CoverFormat => AppleListBox.GetTagBox(TagNameCover)?.Data.DataType;

  public TrackNumber? TrackNumber { get => AppleListBox.GetTagData<TrackNumber>(TagNameTrackNumber); set => AppleListBox.EditOrAddTag(TagNameTrackNumber, value); }

  public DiskNumber? DiskNumber { get => AppleListBox.GetTagData<DiskNumber>(TagNameDiskNumber); set => AppleListBox.EditOrAddTag(TagNameDiskNumber, value); }

  public static MetadataItems? FromFile(string mp4File)
  {
    using var file = File.Open(mp4File, FileMode.Open, FileAccess.Read, FileShare.Read);

    BoxHeader header;
    do
    {
      header = new BoxHeader(file);

      if (header.Type is "moov")
      {
        continue;
      }
      else if (header.Type is "udta")
      {
        break;
      }
      else
      {
        file.Position += header.TotalBoxSize - header.HeaderSize;
      }
    }
    while (file.Position < file.Length);

    return header?.Type is "udta" && new UdtaBox(file, header, null)?.GetChild<MetaBox>()?.GetChild<AppleListBox>() is { } ilst ? new MetadataItems(ilst)
        : null;
  }

  private string[]? GetCopyrights() => Copyright?.Replace("&#169;", "©")?.Split(';');

  private void SetCoverArt(byte[]? coverArtBytes)
  {
    if (coverArtBytes is null)
    {
      AppleListBox.RemoveTag(TagNameCover);
    }
    else if (coverArtBytes.Length >= 2 && BinaryPrimitives.ReadInt16LittleEndian(coverArtBytes) == 0x4D42)
    {
      EditOrAdd(AppleDataType.BMP);
    }
    else if (coverArtBytes.Length >= 3 && (BinaryPrimitives.ReadInt32LittleEndian(coverArtBytes) & 0xFFFFFF) == 0xFFD8FF)
    {
      EditOrAdd(AppleDataType.JPEG);
    }
    else if (coverArtBytes.Length >= 8 && BinaryPrimitives.ReadInt64LittleEndian(coverArtBytes) == 0xA1A0A0D474e5089)
    {
      EditOrAdd(AppleDataType.PNG);
    }
    else
    {
      throw new InvalidDataException("Image data is not a jpeg, PNG, or windows bitmap.");
    }

    void EditOrAdd(AppleDataType dataType)
    {
      if (AppleListBox.GetTagBox(TagNameCover) is { } tagBox && tagBox.Data.DataType != dataType)
      {
        // Allow changing data type by removing and re-adding
        AppleListBox.RemoveTag(tagBox);
        tagBox.Dispose();
      }

      AppleListBox.EditOrAddTag(TagNameCover, coverArtBytes, dataType);
    }
  }
}
