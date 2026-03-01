using System.Diagnostics;
using System.IO;
using System.Linq;
using Oahu.Decrypt.Mpeg4.Boxes.EC3SpecificBox;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes;

/// <summary>
/// EC3SpecificBox. ETSI TS 102 366 F.6
/// </summary>
public class Dec3Box : Box
{
  private readonly byte[] ec3Data;

  public Dec3Box(Stream file, BoxHeader header, IBox? parent) : base(header, parent)
  {
    ec3Data = file.ReadBlock((int)(header.TotalBoxSize - header.HeaderSize));
    var reader = new BitReader(ec3Data);

    AverageBitrate = reader.Read(13) * 1024;
    var num_ind_sub = reader.Read(3);
    Debug.Assert(num_ind_sub == 0);

    IndependentSubstream = new Ec3IndependentSubstream[num_ind_sub + 1];
    for (int i = 0; i <= num_ind_sub; i++)
    {
      IndependentSubstream[i] = new Ec3IndependentSubstream(reader);
    }

    var indSample = IndependentSubstream.First();
    Debug.Assert(indSample.NumDepSub == 0);

    SampleRate = indSample.GetSampleRate();
    NumberOfChannels = indSample.ChannelCount();

    if (reader.Length - reader.Position < 8)
    {
      return;
    }

    // Dolby Atmos content carried by a Dolby Digital Plus stream.
    reader.Position += 7;
    FlagEc3ExtensionTypeA = reader.ReadBool();

    if (FlagEc3ExtensionTypeA.Value)
    {
      ComplexityIndexTypeA = (byte)reader.Read(8);
    }
  }

  public override long RenderSize => base.RenderSize + ec3Data.Length;

  /// <summary>
  /// ETSI TS 102 366 F.6.2.2 data_rate * 1024
  /// </summary>
  public uint AverageBitrate { get; }

  public int SampleRate { get; }

  public int NumberOfChannels { get; }

  public Ec3IndependentSubstream[] IndependentSubstream { get; }

  public bool IsAtmos => FlagEc3ExtensionTypeA.HasValue;

  /// <summary>
  /// Signaling Dolby Digital Plus bitstreams with Dolby Atmos content in an ISO base media format file
  /// Having a value indicates that audio is Dolby Atmos
  /// whether ComplexityIndexTypeA is available in the E-AC-3 descriptor.
  /// </summary>
  public bool? FlagEc3ExtensionTypeA { get; }

  /// <summary>
  ///  Dolby Digital Plus bitstream structure
  ///  takes a value of 1 to 16 that indicates the decoding complexity of the Dolby Atmos bitstream
  /// </summary>
  public byte? ComplexityIndexTypeA { get; }

  protected override void Render(Stream file)
  {
    file.Write(ec3Data);
  }
}
