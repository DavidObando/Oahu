using System.IO;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes;

public class TfhdBox : FullBox
{
  public TfhdBox(Stream file, BoxHeader header, IBox? parent) : base(file, header, parent)
  {
    TrackID = file.ReadUInt32BE();

    if (BaseDataOffsetPresent)
    {
      BaseDataOffset = file.ReadInt64BE();
    }

    if (SampleDescriptionIndexPresent)
    {
      SampleDescriptionIndex = file.ReadUInt32BE();
    }

    if (DefaultSampleDurationPresent)
    {
      DefaultSampleDuration = file.ReadUInt32BE();
    }

    if (DefaultSampleSizePresent)
    {
      DefaultSampleSize = file.ReadUInt32BE();
    }

    if (DefaultSampleFlagsPresent)
    {
      DefaultSampleFlags = file.ReadUInt32BE();
    }
  }

  public override long RenderSize => base.RenderSize + 4 + OptionalFieldsSize;

  public uint TrackID { get; }

  public long? BaseDataOffset { get; }

  public uint? SampleDescriptionIndex { get; }

  public uint? DefaultSampleDuration { get; }

  public uint? DefaultSampleSize { get; }

  public uint? DefaultSampleFlags { get; }

  public bool DurationIsEmpty => (Flags & 0x010000) == 0x010000;

  public bool DefaultBaseIsMoof => (Flags & 0x020000) == 0x020000;

  private int OptionalFieldsSize =>
      (BaseDataOffsetPresent ? 8 : 0) +
      (SampleDescriptionIndexPresent ? 4 : 0) +
      (DefaultSampleDurationPresent ? 4 : 0) +
      (DefaultSampleSizePresent ? 4 : 0) +
      (DefaultSampleFlagsPresent ? 4 : 0);

  private bool BaseDataOffsetPresent => (Flags & 1) == 1;

  private bool SampleDescriptionIndexPresent => (Flags & 2) == 2;

  private bool DefaultSampleDurationPresent => (Flags & 8) == 8;

  private bool DefaultSampleSizePresent => (Flags & 16) == 16;

  private bool DefaultSampleFlagsPresent => (Flags & 32) == 32;

  protected override void Render(Stream file)
  {
    base.Render(file);
    file.WriteUInt32BE(TrackID);
    if (BaseDataOffset.HasValue)
    {
      file.WriteInt64BE(BaseDataOffset.Value);
    }

    if (SampleDescriptionIndex.HasValue)
    {
      file.WriteUInt32BE(SampleDescriptionIndex.Value);
    }

    if (DefaultSampleDuration.HasValue)
    {
      file.WriteUInt32BE(DefaultSampleDuration.Value);
    }

    if (DefaultSampleSize.HasValue)
    {
      file.WriteUInt32BE(DefaultSampleSize.Value);
    }

    if (DefaultSampleFlags.HasValue)
    {
      file.WriteUInt32BE(DefaultSampleFlags.Value);
    }
  }
}
