using System;
using System.Buffers.Binary;

namespace Oahu.Decrypt.Mpeg4;

public interface IAppleData<TData> where TData : IAppleData<TData>
{
  public static abstract int SizeInBytes { get; }

  public static abstract TData Create(ReadOnlySpan<byte> source);

  public void Write(Span<byte> destination);
}

public record TrackNumber(ushort Track, ushort TotalTracks) : IAppleData<TrackNumber>
{
  public static int SizeInBytes => 8;

  public static implicit operator TrackNumber((int TrackNum, int TotalTracks) tn)
  {
    ArgumentOutOfRangeException.ThrowIfNegative(tn.TrackNum, nameof(tn.TrackNum));
    ArgumentOutOfRangeException.ThrowIfNegative(tn.TotalTracks, nameof(tn.TotalTracks));
    ArgumentOutOfRangeException.ThrowIfGreaterThan(tn.TrackNum, ushort.MaxValue, nameof(tn.TrackNum));
    ArgumentOutOfRangeException.ThrowIfGreaterThan(tn.TotalTracks, ushort.MaxValue, nameof(tn.TotalTracks));
    return new TrackNumber((ushort)tn.TrackNum, (ushort)tn.TotalTracks);
  }

  public static TrackNumber Create(ReadOnlySpan<byte> source)
  {
    ArgumentOutOfRangeException.ThrowIfLessThan(source.Length, SizeInBytes, nameof(source));
    return new TrackNumber(BinaryPrimitives.ReadUInt16BigEndian(source[2..4]), BinaryPrimitives.ReadUInt16BigEndian(source[4..6]));
  }

  public void Write(Span<byte> destination)
  {
    ArgumentOutOfRangeException.ThrowIfLessThan(destination.Length, SizeInBytes, nameof(destination));
    BinaryPrimitives.WriteUInt16BigEndian(destination[2..4], Track);
    BinaryPrimitives.WriteUInt16BigEndian(destination[4..6], TotalTracks);
  }
}

public record DiskNumber(ushort Disk, ushort TotalDisks) : IAppleData<DiskNumber>
{
  public static int SizeInBytes => 6;

  public static implicit operator DiskNumber((int DiskNum, int TotalDisks) tn)
  {
    ArgumentOutOfRangeException.ThrowIfNegative(tn.DiskNum, nameof(tn.DiskNum));
    ArgumentOutOfRangeException.ThrowIfNegative(tn.TotalDisks, nameof(tn.TotalDisks));
    ArgumentOutOfRangeException.ThrowIfGreaterThan(tn.DiskNum, ushort.MaxValue, nameof(tn.DiskNum));
    ArgumentOutOfRangeException.ThrowIfGreaterThan(tn.TotalDisks, ushort.MaxValue, nameof(tn.TotalDisks));
    return new DiskNumber((ushort)tn.DiskNum, (ushort)tn.TotalDisks);
  }

  public static DiskNumber Create(ReadOnlySpan<byte> source)
  {
    ArgumentOutOfRangeException.ThrowIfLessThan(source.Length, SizeInBytes, nameof(source));
    return new DiskNumber(BinaryPrimitives.ReadUInt16BigEndian(source[2..4]), BinaryPrimitives.ReadUInt16BigEndian(source[4..6]));
  }

  public void Write(Span<byte> destination)
  {
    ArgumentOutOfRangeException.ThrowIfLessThan(destination.Length, SizeInBytes, nameof(destination));
    BinaryPrimitives.WriteUInt16BigEndian(destination[2..4], Disk);
    BinaryPrimitives.WriteUInt16BigEndian(destination[4..6], TotalDisks);
  }
}
