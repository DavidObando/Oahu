using System;
using System.IO;
using Oahu.Decrypt.Mpeg4.Util;

namespace Oahu.Decrypt.Mpeg4.Boxes;

public class VisualSampleEntry : SampleEntry
{
  private readonly byte[] preDefined1;
  private readonly byte[] reserved;
  private readonly byte[] preDefined2;
  private readonly byte[] reserved2;
  private readonly byte[] preDefined3;

  public VisualSampleEntry(Stream file, BoxHeader header, IBox? parent) : base(file, header, parent)
  {
    preDefined1 = file.ReadBlock(2);
    reserved = file.ReadBlock(2);
    preDefined2 = file.ReadBlock(sizeof(uint) * 3);
    Width = file.ReadUInt16BE();
    Height = file.ReadUInt16BE();
    HorizontalResolution = file.ReadUInt32BE();
    VerticalResolution = file.ReadUInt32BE();
    reserved2 = file.ReadBlock(4);
    FrameCount = file.ReadUInt16BE();
    var compressorNameBytes = file.ReadBlock(32);
    var displaySize = compressorNameBytes[0];
    if (displaySize > 31)
    {
      throw new InvalidOperationException("Compressor name must be 31 characters or fewer.");
    }

    CompressorName = System.Text.Encoding.UTF8.GetString(compressorNameBytes, 1, displaySize);

    Depth = file.ReadUInt16BE();
    preDefined3 = file.ReadBlock(2);
  }

  public override long RenderSize => base.RenderSize +
      preDefined1.Length +
      reserved.Length +
      preDefined2.Length +
      sizeof(ushort) * 4 +
      sizeof(uint) * 2 +
      reserved2.Length +
      preDefined3.Length +
      32;

  public ushort Width { get; }

  public ushort Height { get; }

  public uint HorizontalResolution { get; }

  public uint VerticalResolution { get; }

  public ushort FrameCount { get; }

  public string CompressorName { get; }

  public ushort Depth { get; }

  protected override void Render(Stream file)
  {
    base.Render(file);
    file.Write(preDefined1);
    file.Write(reserved);
    file.Write(preDefined2);
    file.WriteUInt16BE(Width);
    file.WriteUInt16BE(Height);
    file.WriteUInt32BE(HorizontalResolution);
    file.WriteUInt32BE(VerticalResolution);
    file.Write(reserved2);
    file.WriteUInt16BE(FrameCount);
    var compressorNameBytes = new byte[32];
    if (CompressorName.Length > 31)
    {
      throw new InvalidOperationException("Compressor name must be 31 characters or fewer.");
    }

    compressorNameBytes[0] = (byte)CompressorName.Length;
    System.Text.Encoding.UTF8.GetBytes(CompressorName, 0, CompressorName.Length, compressorNameBytes, 1);
    file.Write(compressorNameBytes);
    file.WriteUInt16BE(Depth);
    file.Write(preDefined3);
  }
}
