using System.IO;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes.EC3SpecificBox;

/// <summary>
/// Part of the EC3SpecificBox. Represents an independent substream in E-AC-3.
/// ETSI TS 102 366 F.6
/// </summary>
public class Ec3IndependentSubstream
{
  /// <summary>
  /// ETSI TS 102 366 4.4.1.3 fscod - Sample rate code - 2 bits
  /// Table 4.1: Sample rate codes
  /// </summary>
  public byte Fscod;

  /// <summary>
  /// ETSI TS 102 366 4.4.2.1 bsid - Bit stream identification
  /// </summary>
  public byte Bsid;

  /// <summary>
  /// ETSI TS 102 366 F.6.2.7 asvc - is a main audio service
  /// Value must be 16 for E-AC-3 (E.1.1 Indication of Enhanced AC-3 bit stream syntax)
  /// </summary>
  public bool Asvc;

  /// <summary>
  /// ETSI TS 102 366 4.4.2.2 bsmod - Bit stream mode - 3 bits
  /// Table 4.2: Bit stream mode
  /// </summary>
  public byte Bsmod;

  /// <summary>
  /// ETSI TS 102 366 4.4.2.3 acmod - Audio coding mode
  /// </summary>
  public AudioCodingMode Acmod;

  /// <summary>
  /// ETSI TS 102 366 4.4.2.7 lfeon - Low frequency effects channel on
  /// </summary>
  public bool Lfeon;

  /// <summary>
  /// ETSI TS 102 366 F.6.2.12 num_dep_sub
  /// </summary>
  public byte NumDepSub;

  /// <summary>
  /// ETSI TS 102 366 F.6.2.13 chan_loc - channel locations
  /// </summary>
  public ChannelLocation ChanLoc;

  public Ec3IndependentSubstream(BitReader reader)
  {
    Fscod = (byte)reader.Read(2);
    Bsid = (byte)reader.Read(5);
    if (Bsid != 16)
    {
      throw new InvalidDataException($"Invalid bsid value: {Bsid}. Expected 16 for E-AC-3.");
    }

    reader.Position += 1;

    Asvc = reader.ReadBool();
    Bsmod = (byte)reader.Read(3);
    Acmod = (AudioCodingMode)reader.Read(3);
    Lfeon = reader.Read(1) > 0;
    reader.Position += 3;
    var numDepSub = reader.Read(4);

    if (numDepSub > 0)
    {
      ChanLoc = (ChannelLocation)reader.Read(9);
    }
    else
    {
      reader.Position++;
    }
  }
}
