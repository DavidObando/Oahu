using System.IO;

namespace Oahu.Decrypt.Mpeg4.Boxes.EC3SpecificBox;

public static class Ec3Extensions
{
  /// <summary>
  /// ETSI TS 102 366 4.4.2.3 Table 4.3: Audio coding mode column 4 (Nfchans)
  /// </summary>
  private static readonly byte[] FfAc3ChannelsTab = [2, 1, 2, 3, 3, 4, 4, 5];

  public static int GetSampleRate(this Ec3IndependentSubstream indSub)
      => indSub.Fscod == 0 ? 48000
      : indSub.Fscod == 1 ? 44100
      : indSub.Fscod == 2 ? 32000
      : throw new InvalidDataException($"{nameof(indSub.Fscod)} value of {indSub.Fscod} is not valid");

  public static int ChannelCount(this Ec3IndependentSubstream indSub)
       => FfAc3ChannelsTab[(byte)indSub.Acmod] + (indSub.Lfeon ? 1 : 0);
}
