using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes.AC4SpecificBox;

/// <summary>
/// ETSI TS 103 190-2 E.11 ac4_substream_group_dsi
/// </summary>
public class ac4_substream
{
  public byte DsiSfMultiplier;
  public bool BSubstreamBitrateIndicator;
  public byte? SubstreamBitrateIndicator;
  public ChannelGroups? DsiSubstreamChannelMask;
  public bool? BAjoc;
  public bool? BStaticDmx;
  public byte? NDmxObjectsMinus1;
  public byte? NUmxObjectsMinus1;
  public bool? BSubstreamContainsBedObjects;
  public bool? BSubstreamContainsDynamicObjects;
  public bool? BSubstreamContainsIsfObjects;

  public ac4_substream(ac4_substream_group_dsi info, BitReader reader)
  {
    DsiSfMultiplier = (byte)reader.Read(2);
    BSubstreamBitrateIndicator = reader.ReadBool();
    if (BSubstreamBitrateIndicator)
    {
      SubstreamBitrateIndicator = (byte)reader.Read(5);
    }

    if (info.BChannelCoded)
    {
      DsiSubstreamChannelMask = (ChannelGroups)reader.Read(24);
    }
    else
    {
      BAjoc = reader.ReadBool();
      if (BAjoc.Value)
      {
        BStaticDmx = reader.ReadBool();
        if (BStaticDmx.Value)
        {
          NDmxObjectsMinus1 = (byte)reader.Read(4);
        }

        NUmxObjectsMinus1 = (byte)reader.Read(6);
      }

      BSubstreamContainsBedObjects = reader.ReadBool();
      BSubstreamContainsDynamicObjects = reader.ReadBool();
      BSubstreamContainsIsfObjects = reader.ReadBool();
      _ = reader.Read(1);
    }
  }
}
