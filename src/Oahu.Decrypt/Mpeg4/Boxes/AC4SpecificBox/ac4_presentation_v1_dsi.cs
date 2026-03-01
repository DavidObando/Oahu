using System;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes.AC4SpecificBox;

/// <summary>
/// ETSI TS 103 190-2 E.10 ac4_presentation_v1_dsi
/// </summary>
public class ac4_presentation_v1_dsi
{
  public uint PresentationVersion;
  public byte PresentationConfigV1;
  public bool BAddEmdfSubstreams;
  public byte? Mdcompat;
  public bool? BPresentationId;
  public byte? PresentationId;
  public byte? DsiFrameRateMultiplyInfo;
  public byte? DsiFrameRateFractionInfo;
  public byte? PresentationEmdfVersion;
  public ushort? PresentationKeyId;
  public bool? BPresentationChannelCoded;
  public byte? DsiPresentationChMode;
  public byte? PresB4BackChannelsPresent;
  public byte? PresTopChannelPairs;
  public ChannelGroups? PresentationChannelMaskV1;
  public bool? BPresentationCoreDiffers;
  public bool? BPresentationCoreChannelCoded;
  public byte? DsiPresentationChannelModeCore;
  public bool? BPresentationFilter;
  public bool? BEnablePresentation;
  public byte? NFilterBytes;
  public byte[]? FilterData;

  public ac4_substream_group_dsi? Substream;
  public bool? BPreVirtualized;
  public byte? NAddEmdfSubstreams;
  public (byte SubstreamEmdfVersion, ushort SubstreamKeyId)[]? SubstreamsEmdfs;
  public bool BPresentationBitrateInfo;
  public ac4_bitrate_dsi? Ac4BitrateDsi;
  public bool BAlternative;
  public alternative_info? AlternativeInfo;
  public byte? DeIndicator;
  public bool? BExtendedPresentationId;
  public ushort? ExtendedPresentationId;

  public bool? DolbyAtmosIndicator;

  public ac4_presentation_v1_dsi(uint presentationVersion, uint presBytes, BitReader reader)
  {
    PresentationVersion = presentationVersion;
    var start = reader.Position;

    PresentationConfigV1 = (byte)reader.Read(5);
    if (PresentationConfigV1 is 6)
    {
      BAddEmdfSubstreams = true;
    }
    else
    {
      Mdcompat = (byte)reader.Read(3);
      BPresentationId = reader.ReadBool();
      if (BPresentationId.Value)
      {
        PresentationId = (byte)reader.Read(5);
      }

      DsiFrameRateMultiplyInfo = (byte)reader.Read(2);
      DsiFrameRateFractionInfo = (byte)reader.Read(2);
      PresentationEmdfVersion = (byte)reader.Read(5);
      PresentationKeyId = (ushort)reader.Read(10);
      BPresentationChannelCoded = reader.ReadBool();

      if (BPresentationChannelCoded.Value)
      {
        DsiPresentationChMode = (byte)reader.Read(5);
        if (DsiPresentationChMode is 11 or 12 or 13 or 14)
        {
          PresB4BackChannelsPresent = (byte)reader.Read(1);
          PresTopChannelPairs = (byte)reader.Read(2);
        }

        PresentationChannelMaskV1 = (ChannelGroups)reader.Read(24);
      }

      BPresentationCoreDiffers = reader.ReadBool();
      if (BPresentationCoreDiffers.Value)
      {
        BPresentationCoreChannelCoded = reader.ReadBool();
        if (BPresentationCoreChannelCoded.Value)
        {
          DsiPresentationChannelModeCore = (byte)reader.Read(2);
        }
      }

      BPresentationFilter = reader.ReadBool();
      if (BPresentationFilter.Value)
      {
        BEnablePresentation = reader.ReadBool();
        NFilterBytes = (byte)reader.Read(8);
        FilterData = new byte[NFilterBytes.Value];
        for (int i = 0; i < NFilterBytes.Value; i++)
        {
          FilterData[i] = (byte)reader.Read(8);
        }
      }

      if (PresentationConfigV1 == 0x1f)
      {
        Substream = new ac4_substream_group_dsi(reader);
      }
      else
      {
        throw new NotSupportedException();
      }

      BPreVirtualized = reader.ReadBool();
      BAddEmdfSubstreams = reader.ReadBool();
    }

    if (BAddEmdfSubstreams)
    {
      NAddEmdfSubstreams = (byte)reader.Read(7);
      SubstreamsEmdfs = new (byte SubstreamEmdfVersion, ushort SubstreamKeyId)[NAddEmdfSubstreams.Value];
      for (int j = 0; j < NAddEmdfSubstreams; j++)
      {
        SubstreamsEmdfs[j] = ((byte)reader.Read(5), (ushort)reader.Read(10));
      }
    }

    BPresentationBitrateInfo = reader.ReadBool();
    if (BPresentationBitrateInfo)
    {
      Ac4BitrateDsi = new ac4_bitrate_dsi(reader);
    }

    BAlternative = reader.ReadBool();
    if (BAlternative)
    {
      reader.ByteAlign();
      AlternativeInfo = new alternative_info(reader);
    }

    reader.ByteAlign();

    var read = reader.Position - start;
    if (read <= (presBytes - 1) * 8)
    {
      DeIndicator = (byte)reader.Read(1);

      // Extension to AC-4 DSI
      DolbyAtmosIndicator = reader.ReadBool();
      _ = reader.Read(4);
      BExtendedPresentationId = reader.ReadBool();
      if (BExtendedPresentationId.Value)
      {
        ExtendedPresentationId = (ushort)reader.Read(9);
      }
      else
      {
        _ = reader.Read(1);
      }
    }
  }
}
