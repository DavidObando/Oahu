using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes.AC4SpecificBox;

/// <summary>
/// ETSI TS 103 190-2 E.7 ac4_bitrate_dsi
/// </summary>
public class Ac4BitrateDsi
{
  public BitRateMode BitRateMode;
  public uint BitRate;
  public uint BitRatePrecision;

  public Ac4BitrateDsi(BitReader reader)
  {
    BitRateMode = (BitRateMode)reader.Read(2);
    BitRate = reader.Read(32);
    BitRatePrecision = reader.Read(32);
  }
}
