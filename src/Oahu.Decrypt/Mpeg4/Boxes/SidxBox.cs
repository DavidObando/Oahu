using System;
using System.IO;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes;

public class SidxBox : FullBox
{
  public SidxBox(Stream file, BoxHeader header, IBox? parent) : base(file, header, parent)
  {
    ReferenceId = file.ReadUInt32BE();
    Timescale = file.ReadInt32BE();

    if (Version == 0)
    {
      EarliestPresentationTime = file.ReadUInt32BE();
      FirstOffset = file.ReadUInt32BE();
    }
    else
    {
      EarliestPresentationTime = file.ReadInt64BE();
      FirstOffset = file.ReadInt64BE();
    }

    _ = file.ReadInt16BE();
    int referenceCount = file.ReadUInt16BE();

    Segments = new Segment[referenceCount];
    for (int i = 0; i < Segments.Length; i++)
    {
      Segments[i] = new Segment(file);
    }
  }

  public override long RenderSize => base.RenderSize + 8 + (Version == 0 ? 8 : 16) + 4 + Segments.Length * 12;

  public uint ReferenceId { get; }

  public int Timescale { get; }

  public long EarliestPresentationTime { get; }

  public long FirstOffset { get; }

  public Segment[] Segments { get; }

  protected override void Render(Stream file)
  {
    base.Render(file);
    file.WriteUInt32BE(ReferenceId);
    file.WriteInt32BE(Timescale);

    if (Version == 0)
    {
      file.WriteUInt32BE((uint)EarliestPresentationTime);
      file.WriteUInt32BE((uint)FirstOffset);
    }
    else
    {
      file.WriteInt64BE(EarliestPresentationTime);
      file.WriteInt64BE(FirstOffset);
    }

    file.WriteInt16BE(0);
    file.WriteInt16BE((short)Segments.Length);
    foreach (var segment in Segments)
    {
      segment.Save(file);
    }
  }

  public class Segment
  {
    private uint typeAndSize;
    private uint subsegmentDuration;
    private uint sap;

    internal Segment(Stream file)
    {
      typeAndSize = file.ReadUInt32BE();
      subsegmentDuration = file.ReadUInt32BE();
      sap = file.ReadUInt32BE();
    }

    public bool ReferenceType
    {
      get => (typeAndSize & 0x80000000) == 0x80000000;
      set => typeAndSize = value ? typeAndSize | 0x80000000 : typeAndSize & 0x7FFFFFFF;
    }

    public int ReferenceSize
    {
      get => (int)(typeAndSize & 0x7FFFFFFF);
      set
      {
        ArgumentOutOfRangeException.ThrowIfLessThan(value, 0, nameof(ReferenceSize));

        typeAndSize = (typeAndSize & 0x80000000) | (uint)value;
      }
    }

    public uint SubsegmentDuration
    {
      get => subsegmentDuration;
      set => subsegmentDuration = value;
    }

    public bool StartsWithSAP
    {
      get => (sap & 0x80000000) == 0x80000000;
      set => sap = value ? sap | 0x80000000 : sap & 0x7FFFFFFF;
    }

    public int SapType
    {
      get => (int)(sap >> 28) & 7;
      set
      {
        ArgumentOutOfRangeException.ThrowIfLessThan(value, 0, nameof(SapType));
        ArgumentOutOfRangeException.ThrowIfGreaterThan(value, 7, nameof(SapType));

        sap = (sap & 0x8FFFFFFF) | (uint)(value << 28);
      }
    }

    public int SapDeltaTime
    {
      get => (int)sap & 0xFFFFFFF;
      set
      {
        ArgumentOutOfRangeException.ThrowIfLessThan(value, 0, nameof(SapType));
        ArgumentOutOfRangeException.ThrowIfGreaterThan(value, 0xFFFFFFF, nameof(SapType));
        sap = (sap & 0xF0000000) | (uint)value;
      }
    }

    public void Save(Stream file)
    {
      file.WriteUInt32BE(typeAndSize);
      file.WriteUInt32BE(subsegmentDuration);
      file.WriteUInt32BE(sap);
    }
  }
}
