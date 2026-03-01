using System.IO;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes;

public class TrunBox : FullBox
{
  public TrunBox(Stream file, BoxHeader header, IBox? parent) : base(file, header, parent)
  {
    uint sampleCount = file.ReadUInt32BE();
    if (DataOffsetPresent)
    {
      DataOffset = file.ReadInt32BE();
    }

    if (FirstSampleFlagsPresent)
    {
      FirstSampleFlags = file.ReadUInt32BE();
    }

    Samples = new SampleInfo[sampleCount];

    for (int i = 0; i < sampleCount; i++)
    {
      uint? sampleDuration = SampleDurationPresent ? file.ReadUInt32BE() : null;
      int? sampleSize = SampleSizePresent ? file.ReadInt32BE() : null;
      uint? sampleFlags = SampleFlagsPresent ? file.ReadUInt32BE() : null;
      int? sampleCompositionTimeOffset = SampleCompositionTimeOffsetsPresent ? file.ReadInt32BE() : null;

      Samples[i] = new SampleInfo(sampleDuration, sampleSize, sampleFlags, sampleCompositionTimeOffset);
    }
  }

  public override long RenderSize => base.RenderSize + 4 + (DataOffsetPresent ? 4 : 0) + (FirstSampleFlagsPresent ? 4 : 0) + SampleInfoSize * Samples.Length;

  public int DataOffset { get; }

  public uint FirstSampleFlags { get; }

  public SampleInfo[] Samples { get; }

  public bool SampleDurationPresent => (Flags & 0x100) == 0x100;

  public bool SampleSizePresent => (Flags & 0x200) == 0x200;

  private bool DataOffsetPresent => (Flags & 1) == 1;

  private bool FirstSampleFlagsPresent => (Flags & 4) == 4;

  private bool SampleFlagsPresent => (Flags & 0x400) == 0x400;

  private bool SampleCompositionTimeOffsetsPresent => (Flags & 0x800) == 0x800;

  private int SampleInfoSize =>
      (SampleDurationPresent ? 4 : 0) +
      (SampleSizePresent ? 4 : 0) +
      (SampleFlagsPresent ? 4 : 0) +
      (SampleCompositionTimeOffsetsPresent ? 4 : 0);

  protected override void Render(Stream file)
  {
    base.Render(file);
    file.WriteInt32BE(Samples.Length);
    if (DataOffsetPresent)
    {
      file.WriteInt32BE(DataOffset);
    }

    if (FirstSampleFlagsPresent)
    {
      file.WriteUInt32BE(FirstSampleFlags);
    }

    for (int i = 0; i < Samples.Length; i++)
    {
      if (SampleDurationPresent)
      {
        file.WriteUInt32BE(Samples[i].SampleDuration ?? 0);
      }

      if (SampleSizePresent)
      {
        file.WriteInt32BE(Samples[i].SampleSize ?? 0);
      }

      if (SampleFlagsPresent)
      {
        file.WriteUInt32BE(Samples[i].SampleFlags ?? 0);
      }

      if (SampleCompositionTimeOffsetsPresent)
      {
        file.WriteInt32BE(Samples[i].SampleCompositionTimeOffset ?? 0);
      }
    }
  }

  public class SampleInfo
  {
    public SampleInfo(uint? sampleDuration, int? sampleSize, uint? sampleFlags, int? sampleCompositionTimeOffset)
    {
      SampleDuration = sampleDuration;
      SampleSize = sampleSize;
      SampleFlags = sampleFlags;
      SampleCompositionTimeOffset = sampleCompositionTimeOffset;
    }

    public uint? SampleDuration { get; }

    public int? SampleSize { get; }

    public uint? SampleFlags { get; }

    public int? SampleCompositionTimeOffset { get; }
  }
}
