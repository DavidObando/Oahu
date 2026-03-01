using System;
using System.Linq;

namespace Oahu.Decrypt.Mpeg4.ID3;

public class Flags
{
  private byte[] flags;

  public Flags(params byte[] flags)
  {
    this.flags = flags;
  }

  public Flags(ushort flags)
  {
    this.flags = [(byte)(flags >> 8), (byte)(flags & 0xff)];
  }

  public int Size => this.flags.Length;

  public bool this[int index]
  {
    get
    {
      if (index < 0 || index >= flags.Length * 8)
      {
        throw new ArgumentOutOfRangeException(nameof(index), "Index must be within the range of the flags.");
      }

      return (flags[index / 8] & (1 << (7 - (index % 8)))) != 0;
    }

    set
    {
      if (index < 0 || index >= flags.Length * 8)
      {
        throw new ArgumentOutOfRangeException(nameof(index), "Index must be within the range of the flags.");
      }

      if (value)
      {
        flags[index / 8] |= (byte)(1 << (7 - (index % 8)));
      }
      else
      {
        flags[index / 8] &= (byte)~(1 << (7 - (index % 8)));
      }
    }
  }

  public byte[] ToBytes() => flags.ToArray();
}
