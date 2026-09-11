package Oahu.Decrypt.Mpeg4.Chunks

import Oahu.Decrypt.Mpeg4.Boxes
import System
import System.Collections
import System.Collections.Generic
import System.Linq

/// A readonly list of (cref:ChunkEntry) from a (cref:TrakBox)
class ChunkEntryList : IReadOnlyCollection[ChunkEntry] {
    private let chunkOffsets ChunkOffsetList
    private let stsz IStszBox
    private let stts SttsBox
    private let chunkFrameTable[]ChunkFrames
    private let trackId uint32

    init(track TrakBox) {
        trackId = track.Tkhd.TrackID
        stsz = track.Mdia.Minf.Stbl.Stsz ?? throw ArgumentNullException("track")
        let coBox = track.Mdia.Minf.Stbl.COBox
        ArgumentOutOfRangeException.ThrowIfGreaterThan(coBox.EntryCount, uint32(int32.MaxValue), "COBox.EntryCount")
        chunkOffsets = coBox.ChunkOffsets
        Count = int32(coBox.EntryCount)
        stts = track.Mdia.Minf.Stbl.Stts
        chunkFrameTable = track.Mdia.Minf.Stbl.Stsc.CalculateChunkFrameTable(coBox.EntryCount)
    }

    prop Count int32 {
        get;
        init;
    }

    func GetEnumerator() IEnumerator[ChunkEntry] -> EnumerateChunks().GetEnumerator()

    private func (IEnumerable) GetEnumerator() IEnumerator -> GetEnumerator()

    private func EnumerateChunks() sequence[ChunkEntry] {
        var startSample int64 = 0
        for var chunkIndex = 0;
        chunkIndex < Count;
        chunkIndex++ {
            let chunkOffset = chunkOffsets.GetOffsetAtIndex(chunkIndex)
            let chunkFrames = chunkFrameTable[chunkIndex]
            let (frameSizes, totalChunkSize) = stsz.GetFrameSizes(
                chunkFrames.FirstFrameIndex,
                chunkFrames.NumberOfFrames
            )
            let frameDurations = stts
                .EnumerateFrameDeltas(chunkFrames.FirstFrameIndex)
                .Take(frameSizes.Length)
                .ToArray()
            let entry = ChunkEntry{
                TrackId: trackId,
                FrameSizes: frameSizes,
                ChunkIndex: uint32(chunkIndex),
                ChunkSize: totalChunkSize,
                ChunkOffset: chunkOffset,
                FirstSample: startSample,
                FrameDurations: frameDurations
            }
            startSample += entry.FrameDurations.Sum(
                func (d uint32) int64 {
                    return d
                }
            )
            yield entry
        }
    }
}
