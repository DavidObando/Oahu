using System;
using System.Security.Cryptography;

namespace Oahu.Decrypt.Mpeg4.Util;

// https://github.com/FFmpeg/FFmpeg/blob/master/libavutil/aes_ctr.c
public unsafe class AesCtr : IDisposable
{
  public const int AesBlockSize = 16;

  private readonly ICryptoTransform encryptor;
  private readonly Aes aes;
  private readonly byte[] encryptedCounter = new byte[AesBlockSize];
  private bool isDisposed;

  public AesCtr(byte[] key)
  {
    ArgumentNullException.ThrowIfNull(key, nameof(key));
    if (key.Length != AesBlockSize)
    {
      throw new ArgumentException($"{nameof(key)} must be exactly {AesBlockSize} bytes long.");
    }

    aes = Aes.Create();
    aes.Padding = PaddingMode.None;
    aes.Mode = CipherMode.ECB;
    encryptor = aes.CreateEncryptor(key, null);
  }

  public unsafe void Decrypt(byte[] iv, ReadOnlySpan<byte> source, Span<byte> destination)
  {
    ArgumentNullException.ThrowIfNull(iv, nameof(iv));
    ArgumentOutOfRangeException.ThrowIfNotEqual(iv.Length, AesBlockSize, nameof(iv));

    if (destination.Length < source.Length)
    {
      throw new ArithmeticException($"Destination array is not long enough. (Parameter '{nameof(destination)}')");
    }

    const int aesNumDwords = AesBlockSize / sizeof(uint);

    fixed (byte* pD = destination)
    {
      fixed (byte* pS = source)
      {
        fixed (byte* pEc = encryptedCounter)
        {
          uint* pD32 = (uint*)pD;
          uint* pS32 = (uint*)pS;
          uint* pEc32 = (uint*)pEc;

          int dataPos = 0, count = source.Length;

          while (count >= AesBlockSize)
          {
            encryptor.TransformBlock(iv, 0, AesBlockSize, encryptedCounter, 0);
            IncrementBE(iv);

            for (int i = 0; i < aesNumDwords; i++)
            {
              *pD32++ = pEc32[i] ^ *pS32++;
            }

            dataPos += AesBlockSize;
            count -= AesBlockSize;
          }

          if (count > 0)
          {
            encryptor.TransformBlock(iv, 0, AesBlockSize, encryptedCounter, 0);

            for (int i = 0; i < count; i++, dataPos++)
            {
              pD[dataPos] = (byte)(pEc[i] ^ pS[dataPos]);
            }
          }
        }
      }
    }
  }

  public void Dispose()
  {
    Dispose(true);
    GC.SuppressFinalize(this);
  }

  private static void IncrementBE(byte[] data)
  {
    int i = data.Length - 1;
    do
    {
      data[i]++;
    }
    while (data[i] == 0 && i-- > 0);
  }

  private void Dispose(bool disposing)
  {
    if (disposing & !isDisposed)
    {
      encryptor.Dispose();
      aes.Dispose();
      isDisposed = true;
    }
  }
}
