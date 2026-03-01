using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes.AC4SpecificBox;

public class alternative_info
{
  public ushort NameLen;
  public string PresentationName;
  public byte NTargets;
  public (byte TargetMdCompat, byte TargetDeviceCategory)[] TargetIds;

  public alternative_info(BitReader reader)
  {
    NameLen = (ushort)reader.Read(16);
    char[] nameBts = new char[NameLen];
    for (int i = 0; i < NameLen; i++)
    {
      nameBts[i] = (char)reader.Read(8);
    }

    PresentationName = new string(nameBts);
    NTargets = (byte)reader.Read(5);
    TargetIds = new (byte TargetMdCompat, byte TargetDeviceCategory)[NTargets];

    for (int i = 0; i < NameLen; i++)
    {
      TargetIds[i] = ((byte)reader.Read(3), (byte)reader.Read(8));
    }
  }
}
