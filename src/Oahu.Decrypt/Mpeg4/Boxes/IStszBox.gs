package Oahu.Decrypt.Mpeg4.Boxes

interface IStszBox : IBox {
    prop SampleCount int32 {
        get;
    }

    /// The largest sample size in the box
    prop MaxSize int32 {
        get;
    }

    /// Sum of all sample sizes in the box
    prop TotalSize int64 {
        get;
    }

    func GetSizeAtIndex(index int32) int32;

    func SumFirstNSizes(firstN int32) int64;

    /// Retrieves the frame sizes for [`numFrames`](paramref) frames starting at
    /// [`firstFrameIndex`](paramref)
    /// @param firstFrameIndex The first frame to retrieve the size of
    /// @param numFrames The number of frames to retrieve sizes of
    /// @returns A tuple containing the size of each frame in an int[] and the total size of all the frames.
    func GetFrameSizes(firstFrameIndex uint32, numFrames uint32)(FrameSizes[]int32, FramesSizeTotal int32) {
        let frameSizes = [int32(numFrames)]int32
        var framesSizeTotal = 0
        for var i uint32 = uint32(0);
        i < numFrames;
        i++ {
            frameSizes[i] = GetSizeAtIndex(int32((i + firstFrameIndex)))
            framesSizeTotal += frameSizes[i]
        }
        return (frameSizes, framesSizeTotal)
    }
}
