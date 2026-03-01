using System.IO;
using Oahu.Decrypt.Mpeg4.Boxes.AC4SpecificBox;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes;

/// <summary>
/// AC4SpecificBox. ETSI TS 103 190-2 E.5
/// </summary>
public class Dac4Box : Box
{
  public Ac4DsiV1? Ac4DsiV1;

  private readonly byte[] ac4Data;

  public Dac4Box(Stream file, BoxHeader header, IBox? parent) : base(header, parent)
  {
    ac4Data = file.ReadBlock((int)(header.TotalBoxSize - header.HeaderSize));
    try
    {
      var reader = new BitReader(ac4Data);
      Ac4DsiV1 = new Ac4DsiV1(reader);
    }
    catch
    {
      return;
    }

    SampleRate = Ac4DsiV1.SampleRate();
    AverageBitrate = Ac4DsiV1.AverageBitrate();
    NumberOfChannels = Ac4DsiV1.Channels()?.ChannelCount();
  }

  public override long RenderSize => base.RenderSize + ac4Data.Length;

  public uint? AverageBitrate { get; }

  public int? SampleRate { get; }

  public int? NumberOfChannels { get; }

  protected override void Render(Stream file)
  {
    file.Write(ac4Data);
  }
}
