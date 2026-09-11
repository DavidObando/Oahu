package Oahu.Decrypt.FrameFilters

import Oahu.Decrypt.Mpeg4.Chunks
import System

class FrameEntry {
    prop Chunk ChunkEntry? {
        get;
        init;
    }

    prop SamplesInFrame uint32 {
        get;
        init;
    }

    prop FrameData Memory[uint8] {
        get;
        init;
    }

    prop ExtraData object?
}
