using System;
using System.IO;

namespace Oahu.Decrypt.Mpeg4
{
  /// <summary>
  /// A read-only stream that tracks the stream position based on the number of bytes read.
  /// </summary>
  public class TrackedReadStream : Stream
  {
    private readonly Stream baseStream;
    private readonly long baseStreamLength;
    private long readPosition = 0;

    public TrackedReadStream(Stream baseStream, long streamLength)
    {
      this.baseStream = baseStream;
      baseStreamLength = streamLength;
    }

    public override bool CanRead => this.baseStream.CanRead;

    public override bool CanSeek => this.baseStream.CanSeek;

    public override long Length => baseStreamLength;

    public override bool CanWrite => this.baseStream.CanWrite;

    public override long Position
    {
      get => CanSeek ? this.baseStream.Position : readPosition;
      set
      {
        if (!CanSeek)
        {
          throw new NotSupportedException();
        }

        this.baseStream.Position = readPosition = value;
      }
    }

    public override void Flush()
        => throw new NotSupportedException();

    public override int Read(byte[] buffer, int offset, int count)
    {
      this.baseStream.ReadExactly(buffer, offset, count);
      readPosition += count;
      return count;
    }

    public override long Seek(long offset, SeekOrigin origin)
    {
      return readPosition = CanSeek ? this.baseStream.Seek(offset, origin)
          : throw new NotSupportedException();
    }

    public override void SetLength(long value)
        => this.baseStream.SetLength(value);

    public override void Write(byte[] buffer, int offset, int count)
        => this.baseStream.Write(buffer, offset, count);

    protected override void Dispose(bool disposing)
    {
      if (disposing)
      {
        this.baseStream.Dispose();
      }

      base.Dispose(disposing);
    }
  }
}
