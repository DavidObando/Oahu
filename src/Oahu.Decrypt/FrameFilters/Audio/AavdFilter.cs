using System;
using System.Security.Cryptography;

namespace Oahu.Decrypt.FrameFilters.Audio;

internal class AavdFilter : AacValidateFilter
{
  private const int AesBlockSize = 16;
  private readonly Aes aes;
  private readonly byte[] iv;

  public AavdFilter(byte[] key, byte[] iv)
  {
    if (key is null || key.Length != AesBlockSize)
    {
      throw new ArgumentException($"{nameof(key)} must be {AesBlockSize} bytes long.");
    }

    if (iv is null || iv.Length != AesBlockSize)
    {
      throw new ArgumentException($"{nameof(iv)} must be {AesBlockSize} bytes long.");
    }

    this.aes = Aes.Create();
    this.aes.Key = key;
    this.iv = iv;
  }

  public override FrameEntry PerformFiltering(FrameEntry input)
  {
    if (input.FrameData.Length >= 0x10)
    {
      var encBlocks = input.FrameData.Slice(0, input.FrameData.Length & 0x7ffffff0).Span;
      aes.DecryptCbc(encBlocks, iv, encBlocks, PaddingMode.None);
    }

    return base.PerformFiltering(input);
  }

  protected override void Dispose(bool disposing)
  {
    if (disposing && !Disposed)
    {
      aes.Dispose();
    }

    base.Dispose(disposing);
  }
}
