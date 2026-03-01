using System.IO;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Descriptors;

public class UnknownDescriptor : BaseDescriptor
{
  private readonly byte[] blob;

  public UnknownDescriptor(Stream file, DescriptorHeader header) : base(file, header)
  {
    blob = file.ReadBlock(Header.TotalBoxSize - Header.HeaderSize);
  }

  public override int InternalSize => base.InternalSize + blob.Length;

  public override void Render(Stream file)
  {
    file.Write(blob);
  }
}
