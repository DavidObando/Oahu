using System;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes.AC4SpecificBox;

/// <summary>
/// ETSI TS 103 190-2 E.6 ac4_dsi_v1
/// </summary>
public class ac4_dsi_v1
{
  public byte Ac4DsiVersion;
  public byte BitstreamVersion;
  public byte FsIndex;
  public byte FrameRateIndex;
  public ushort NPresentations;
  public bool? BProgramId;
  public ushort? ShortProgramId;
  public bool? BUuid;
  public Guid? ProgramUuid;
  public ac4_bitrate_dsi Ac4BitrateDsi;
  public object?[] Presentations;

  public ac4_dsi_v1(BitReader reader)
  {
    Ac4DsiVersion = (byte)reader.Read(3);
    BitstreamVersion = (byte)reader.Read(7);
    FsIndex = (byte)reader.Read(1);
    FrameRateIndex = (byte)reader.Read(4);
    NPresentations = (ushort)reader.Read(9);
    if (BitstreamVersion > 1)
    {
      BProgramId = reader.ReadBool();
      if (BProgramId.Value)
      {
        ShortProgramId = (ushort)reader.Read(16);
        BUuid = reader.ReadBool();
        if (BUuid.Value)
        {
          ProgramUuid = new Guid(
              reader.Read(32),
              (ushort)reader.Read(16),
              (ushort)reader.Read(16),
              (byte)reader.Read(8),
              (byte)reader.Read(8),
              (byte)reader.Read(8),
              (byte)reader.Read(8),
              (byte)reader.Read(8),
              (byte)reader.Read(8),
              (byte)reader.Read(8),
              (byte)reader.Read(8));
        }
      }
    }

    Ac4BitrateDsi = new ac4_bitrate_dsi(reader);
    reader.ByteAlign();
    Presentations = new object[NPresentations];
    for (int i = 0; i < NPresentations; i++)
    {
      uint presentationBytes;
      var presentationVersion = reader.Read(8);
      var presBytes = reader.Read(8);
      if (presBytes == 255)
      {
        var addPresBytes = reader.Read(16);
        presBytes += addPresBytes;
      }

      if (presentationVersion == 0)
      {
        // ac4_presentation_v0_dsi();
        throw new NotSupportedException("ac4_presentation_v0_dsi not yet supported");
      }
      else
      {
        if (presentationVersion is 1 or 2)
        {
          // 2 is an Extension to AC-4 DSI
          var start = reader.Position;
          Presentations[i] = new ac4_presentation_v1_dsi(presentationVersion, presBytes, reader);
          presentationBytes = (uint)(reader.Position - start) / 8;
        }
        else
        {
          presentationBytes = 0;
        }
      }

      var skipBytes = presBytes - presentationBytes;
      reader.Position += 8 * (int)skipBytes;
    }
  }
}
