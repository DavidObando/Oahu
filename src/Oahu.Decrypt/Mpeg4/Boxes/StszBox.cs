using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes;

/*
 * When reading stsz from a stream, begin by assuming all sample sizes are <= ushort.MaxValue
 * to save on memory. If a sample size > ushort.MaxValue is encountered, convert to a List<int>.
 */
public class StszBox : FullBox, IStszBox
{
  private readonly int origSampleCount;
  private readonly List<int>? sampleSizes32;
  private readonly List<ushort>? sampleSizes16;

  public unsafe StszBox(Stream file, BoxHeader header, IBox? parent)
      : base(file, header, parent)
  {
    SampleSize = file.ReadInt32BE();
    var sampleCountU = file.ReadUInt32BE();

    // Technically we're losing half the capacity by using a List<T> with int.MaxValue capacity, but at
    // 1024 sample per frame and 44100 Hz, this still allows for > 577 days of audio.
    if (sampleCountU > int.MaxValue)
    {
      throw new NotSupportedException($"Oahu.Decrypt.Mpeg4 does not support MPEG-4 files with more than {int.MaxValue} samples");
    }

    origSampleCount = (int)sampleCountU;
    if (SampleSize > 0)
    {
      return;
    }

    sampleSizes32 = new(origSampleCount);
    CollectionsMarshal.SetCount(sampleSizes32, origSampleCount);
    Span<int> intListSpan = CollectionsMarshal.AsSpan(sampleSizes32);

    file.ReadExactly(MemoryMarshal.AsBytes(intListSpan));

    if (BitConverter.IsLittleEndian)
    {
      BinaryPrimitives.ReverseEndianness(intListSpan, intListSpan);
    }

    if (intListSpan.AllLessThanOrEqual(ushort.MaxValue))
    {
      sampleSizes16 = new(origSampleCount);
      CollectionsMarshal.SetCount(sampleSizes16, origSampleCount);
      Span<ushort> shortListSpan = CollectionsMarshal.AsSpan(sampleSizes16);
      for (int i = 0; i < origSampleCount; i++)
      {
        shortListSpan[i] = (ushort)intListSpan[i];
      }

      CollectionsMarshal.SetCount(sampleSizes32, 0);
      sampleSizes32 = null;
    }
  }

  private StszBox(byte[] versionFlags, BoxHeader header, IBox parent, List<int> sampleSizes)
      : base(versionFlags, header, parent)
  {
    sampleSizes32 = sampleSizes;
  }

  private StszBox(byte[] versionFlags, BoxHeader header, IBox parent, List<ushort> sampleSizes)
      : base(versionFlags, header, parent)
  {
    sampleSizes16 = sampleSizes;
  }

  public override long RenderSize => base.RenderSize + 8 + SampleCount * sizeof(int);

  public int SampleSize { get; }

  public int SampleCount => sampleSizes32?.Count ?? sampleSizes16?.Count ?? origSampleCount;

  public int MaxSize => sampleSizes32?.Max() ?? sampleSizes16?.Max() ?? SampleSize;

  public long TotalSize => sampleSizes32?.Sum(s => (long)s) ?? sampleSizes16?.Sum(s => (long)s) ?? SampleSize * origSampleCount;

  public static StszBox CreateBlank(IBox parent, List<int> sampleSizes)
  {
    int size = 8 + 12 /* empty Box size*/;
    BoxHeader header = new BoxHeader((uint)size, "stsz");

    var stszBox = new StszBox([0, 0, 0, 0], header, parent, sampleSizes);

    parent.Children.Add(stszBox);
    return stszBox;
  }

  public static StszBox CreateBlank(IBox parent, List<ushort> sampleSizes)
  {
    int size = 8 + 12 /* empty Box size*/;
    BoxHeader header = new BoxHeader((uint)size, "stsz");

    var stszBox = new StszBox([0, 0, 0, 0], header, parent, sampleSizes);

    parent.Children.Add(stszBox);
    return stszBox;
  }

  public int GetSizeAtIndex(int index) => sampleSizes32?[index] ?? sampleSizes16?[index] ?? SampleSize;

  public long SumFirstNSizes(int firstN) => sampleSizes32?.Take(firstN).Sum(s => (long)s) ?? sampleSizes16?.Take(firstN).Sum(s => (long)s) ?? (long)SampleSize * firstN;

  protected unsafe override void Render(Stream file)
  {
    base.Render(file);
    file.WriteInt32BE(SampleSize);
    file.WriteUInt32BE((uint)SampleCount);

    if (sampleSizes32 is not null)
    {
      Span<int> intSpan = CollectionsMarshal.AsSpan(sampleSizes32);
      if (BitConverter.IsLittleEndian)
      {
        BinaryPrimitives.ReverseEndianness(intSpan, intSpan);
      }

      file.Write(MemoryMarshal.AsBytes(intSpan));
    }
    else if (sampleSizes16 is not null)
    {
      foreach (var size in sampleSizes16)
      {
        file.WriteInt32BE(size);
      }
    }
  }
}
