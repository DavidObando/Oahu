using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Oahu.Decrypt.Mpeg4.Boxes;

namespace Oahu.Decrypt.Mpeg4.Chunks;

/// <summary>
/// A readonly list of <see cref="ChunkEntry"/> from a <see cref="TrakBox"/>
/// </summary>
public class ChunkEntryList : IReadOnlyCollection<ChunkEntry>
{
  private readonly ChunkOffsetList chunkOffsets;
  private readonly IStszBox stsz;
  private readonly SttsBox stts;
  private readonly ChunkFrames[] chunkFrameTable;
  private readonly uint trackId;

  public ChunkEntryList(TrakBox track)
  {
    trackId = track.Tkhd.TrackID;
    stsz = track.Mdia.Minf.Stbl.Stsz ?? throw new ArgumentNullException(nameof(track));
    var coBox = track.Mdia.Minf.Stbl.COBox;
    ArgumentOutOfRangeException.ThrowIfGreaterThan(coBox.EntryCount, (uint)int.MaxValue, "COBox.EntryCount");
    chunkOffsets = coBox.ChunkOffsets;
    Count = (int)coBox.EntryCount;
    stts = track.Mdia.Minf.Stbl.Stts;
    chunkFrameTable = track.Mdia.Minf.Stbl.Stsc.CalculateChunkFrameTable(coBox.EntryCount);
  }

  public int Count { get; }

  public IEnumerator<ChunkEntry> GetEnumerator()
      => EnumerateChunks().GetEnumerator();

  IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

  private IEnumerable<ChunkEntry> EnumerateChunks()
  {
    long startSample = 0;
    for (int chunkIndex = 0; chunkIndex < Count; chunkIndex++)
    {
      long chunkOffset = chunkOffsets.GetOffsetAtIndex(chunkIndex);
      var chunkFrames = chunkFrameTable[chunkIndex];

      (int[] frameSizes, int totalChunkSize) = stsz.GetFrameSizes(chunkFrames.FirstFrameIndex, chunkFrames.NumberOfFrames);

      var frameDurations = stts.EnumerateFrameDeltas(chunkFrames.FirstFrameIndex).Take(frameSizes.Length).ToArray();

      var entry = new ChunkEntry
      {
        TrackId = trackId,
        FrameSizes = frameSizes,
        ChunkIndex = (uint)chunkIndex,
        ChunkSize = totalChunkSize,
        ChunkOffset = chunkOffset,
        FirstSample = startSample,
        FrameDurations = frameDurations
      };

      startSample += entry.FrameDurations.Sum(d => d);
      yield return entry;
    }
  }
}
