using System.IO;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Descriptors
{
  // ES_Descriptor ISO/IEC 14496-1 Section 7.2.6.5 (pp 35)
  // https://stackoverflow.com/a/61158659/3335599
  public class ES_Descriptor : BaseDescriptor
  {
    private readonly byte esFlags;

    private readonly ushort dependsOnEsId;
    private readonly byte urlLength;
    private readonly byte[]? urlString;
    private readonly ushort ocrEsId;

    public ES_Descriptor(Stream file, DescriptorHeader header) : base(file, header)
    {
      EsId = file.ReadUInt16BE();
      esFlags = (byte)file.ReadByte();

      if (StreamDependenceFlag == 1)
      {
        dependsOnEsId = file.ReadUInt16BE();
      }

      if (UrlFlag == 1)
      {
        urlLength = (byte)file.ReadByte();
        urlString = file.ReadBlock(urlLength);
      }

      if (OcrStreamFlag == 1)
      {
        ocrEsId = file.ReadUInt16BE();
      }

      // Currently only supported child is DecoderConfigDescriptor.
      // Any additional children will be loaded as UnknownDescriptor
      LoadChildren(file);
    }

    private ES_Descriptor() : base(0x3)
    {
      EsId = 0;
      esFlags = 0;
    }

    public ushort EsId { get; }

    public int StreamPriority => esFlags & 31;

    public DecoderConfigDescriptor DecoderConfig => GetChildOrThrow<DecoderConfigDescriptor>();

    public override int InternalSize => base.InternalSize + GetLength();

    private int StreamDependenceFlag => esFlags >> 7;

    private int UrlFlag => (esFlags >> 6) & 1;

    private int OcrStreamFlag => (esFlags >> 5) & 1;

    public static ES_Descriptor CreateAudio()
    {
      var descriptor = new ES_Descriptor();
      var decoder = DecoderConfigDescriptor.CreateAudio();
      var slConfig = SLConfigDescriptor.CreateMp4();
      descriptor.Children.Add(decoder);
      descriptor.Children.Add(slConfig);
      return descriptor;
    }

    public override void Render(Stream file)
    {
      file.WriteUInt16BE(EsId);
      file.WriteByte(esFlags);
      if (StreamDependenceFlag == 1)
      {
        file.WriteUInt16BE(dependsOnEsId);
      }

      if (UrlFlag == 1)
      {
        file.WriteByte(urlLength);
        file.Write(urlString);
      }

      if (OcrStreamFlag == 1)
      {
        file.WriteUInt16BE(ocrEsId);
      }
    }

    private int GetLength()
    {
      int length = 3;
      if (StreamDependenceFlag == 1)
      {
        length += 2;
      }

      if (UrlFlag == 1)
      {
        length += 1 + urlLength;
      }

      if (OcrStreamFlag == 1)
      {
        length += 2;
      }

      return length;
    }
  }
}
