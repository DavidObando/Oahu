using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes.AC4SpecificBox;

/// <summary>
/// ETSI TS 103 190-2 E.11 ac4_substream_group_dsi
/// </summary>
public class ac4_substream_group_dsi
{
  public bool BSubstreamsPresent;
  public bool BHsfExt;
  public bool BChannelCoded;
  public byte NSubstreams;
  public ac4_substream[] Substreams;
  public bool BContentType;

  public byte? ContentClassifier;
  public bool? BLanguageIndicator;
  public int? NLanguageTagBytes;
  public byte[]? LanguageTagBytes;

  public ac4_substream_group_dsi(BitReader reader)
  {
    BSubstreamsPresent = reader.ReadBool();
    BHsfExt = reader.ReadBool();
    BChannelCoded = reader.ReadBool();
    NSubstreams = (byte)reader.Read(8);
    Substreams = new ac4_substream[NSubstreams];
    for (int i = 0; i < NSubstreams; i++)
    {
      Substreams[i] = new ac4_substream(this, reader);
    }

    BContentType = reader.ReadBool();
    if (BContentType)
    {
      ContentClassifier = (byte)reader.Read(3);
      BLanguageIndicator = reader.ReadBool();
      if (BLanguageIndicator.Value)
      {
        NLanguageTagBytes = (byte)reader.Read(6);
        LanguageTagBytes = new byte[NLanguageTagBytes.Value];
        for (int i = 0; i < LanguageTagBytes.Length; i++)
        {
          LanguageTagBytes[i] = (byte)reader.Read(8);
        }
      }
    }
  }
}
