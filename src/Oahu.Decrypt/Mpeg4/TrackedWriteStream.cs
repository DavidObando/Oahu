using System;
using System.IO;

namespace Oahu.Decrypt.Mpeg4
{
  /// <summary>
  /// A write-only stream that tracks the stream position based on the number of bytes written.
  /// </summary>
  public class TrackedWriteStream : Stream
  {
    private readonly Stream baseStream;
    private long writePosition;

    public TrackedWriteStream(Stream baseStream, long initialPosition = 0)
    {
      this.baseStream = baseStream;
      writePosition = initialPosition;
    }

    public override bool CanRead => false;

    public override bool CanSeek => this.baseStream.CanSeek;

    public override long Length => writePosition;

    public override bool CanWrite => this.baseStream.CanWrite;

    public override long Position
    {
      get => CanSeek ? this.baseStream.Position : writePosition;
      set
      {
        if (!CanSeek)
        {
          throw new NotSupportedException();
        }

        this.baseStream.Position = value;
      }
    }

    public override void Flush()
        => this.baseStream.Flush();

    public override int Read(byte[] buffer, int offset, int count)
        => throw new NotSupportedException();

    public override long Seek(long offset, SeekOrigin origin)
    {
      return CanSeek ? this.baseStream.Seek(offset, origin)
          : throw new NotSupportedException();
    }

    public override void SetLength(long value)
        => throw new NotSupportedException();

    public override void Write(byte[] buffer, int offset, int count)
    {
      this.baseStream.Write(buffer, offset, count);
      writePosition += count;
    }

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
