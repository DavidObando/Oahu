package Oahu.Decrypt.Mpeg4.Chunks

class ChunkEntry {
    /// The track's header ID number
    prop TrackId uint32 {
        get;
        init;
    }

    /// Index of the chunk in (cref:Boxes.StcoBox.ChunkOffsets) or (cref:Boxes.Co64Box.ChunkOffsets)
    prop ChunkIndex uint32 {
        get;
        init;
    }

    /// File-based offset to start of chunk
    prop ChunkOffset int64 {
        get;
        init;
    }

    /// Size, in bytes, of all frames in the chunk
    prop FirstSample int64 {
        get;
        init;
    }

    /// Sizes of the frames in the chunk. The sum of these sizes is equal to (cref:ChunkSize)
    prop ChunkSize int32 {
        get;
        init;
    }

    /// The first sample in the chunk, counting from the beginning of the track.
    prop FrameSizes[]int32 {
        get;
        init;
    }

    /// The number of samples in each frame.
    prop FrameDurations[]uint32 {
        get;
        init;
    }

    prop ExtraData object? {
        get;
        init;
    }
}
