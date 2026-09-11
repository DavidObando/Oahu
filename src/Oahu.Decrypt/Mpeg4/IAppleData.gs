package Oahu.Decrypt.Mpeg4

import System
import System.Buffers.Binary

interface IAppleData[TData IAppleData[TData]] {
    func Write(destination Span[uint8]);
    shared{
        prop SizeInBytes int32 {
            get;
        }

        func Create(source ReadOnlySpan[uint8]) TData;
    }
}

open data class TrackNumber(Track uint16, TotalTracks uint16) : IAppleData[TrackNumber] {
    func operator implicit(tn(TrackNum int32, TotalTracks int32)) TrackNumber {
        ArgumentOutOfRangeException.ThrowIfNegative(tn.TrackNum, "TrackNum")
        ArgumentOutOfRangeException.ThrowIfNegative(tn.TotalTracks, "TotalTracks")
        ArgumentOutOfRangeException.ThrowIfGreaterThan(tn.TrackNum, int32(uint16.MaxValue), "TrackNum")
        ArgumentOutOfRangeException.ThrowIfGreaterThan(tn.TotalTracks, int32(uint16.MaxValue), "TotalTracks")
        return TrackNumber(uint16(tn.TrackNum), uint16(tn.TotalTracks))
    }

    func Write(destination Span[uint8]) {
        ArgumentOutOfRangeException.ThrowIfLessThan(destination.Length, SizeInBytes, "destination")
        BinaryPrimitives.WriteUInt16BigEndian(destination[2 .. 4], Track)
        BinaryPrimitives.WriteUInt16BigEndian(destination[4 .. 6], TotalTracks)
    }

    shared {
        prop SizeInBytes int32 -> 8

        func Create(source ReadOnlySpan[uint8]) TrackNumber {
            ArgumentOutOfRangeException.ThrowIfLessThan(source.Length, SizeInBytes, "source")
            return TrackNumber(
                BinaryPrimitives.ReadUInt16BigEndian(source[2 .. 4]),
                BinaryPrimitives.ReadUInt16BigEndian(source[4 .. 6])
            )
        }
    }
}

open data class DiskNumber(Disk uint16, TotalDisks uint16) : IAppleData[DiskNumber] {
    func operator implicit(tn(DiskNum int32, TotalDisks int32)) DiskNumber {
        ArgumentOutOfRangeException.ThrowIfNegative(tn.DiskNum, "DiskNum")
        ArgumentOutOfRangeException.ThrowIfNegative(tn.TotalDisks, "TotalDisks")
        ArgumentOutOfRangeException.ThrowIfGreaterThan(tn.DiskNum, int32(uint16.MaxValue), "DiskNum")
        ArgumentOutOfRangeException.ThrowIfGreaterThan(tn.TotalDisks, int32(uint16.MaxValue), "TotalDisks")
        return DiskNumber(uint16(tn.DiskNum), uint16(tn.TotalDisks))
    }

    func Write(destination Span[uint8]) {
        ArgumentOutOfRangeException.ThrowIfLessThan(destination.Length, SizeInBytes, "destination")
        BinaryPrimitives.WriteUInt16BigEndian(destination[2 .. 4], Disk)
        BinaryPrimitives.WriteUInt16BigEndian(destination[4 .. 6], TotalDisks)
    }

    shared {
        prop SizeInBytes int32 -> 6

        func Create(source ReadOnlySpan[uint8]) DiskNumber {
            ArgumentOutOfRangeException.ThrowIfLessThan(source.Length, SizeInBytes, "source")
            return DiskNumber(
                BinaryPrimitives.ReadUInt16BigEndian(source[2 .. 4]),
                BinaryPrimitives.ReadUInt16BigEndian(source[4 .. 6])
            )
        }
    }
}
