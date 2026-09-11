package Oahu.Decrypt.Mpeg4.Boxes

import Oahu.Decrypt.Mpeg4.Util
import System
import System.IO
import System.Threading
import System.Threading.Tasks

open class MdatBox : Box {
    init(header BoxHeader) : base(header, nil) { }

    /// Shifts the position of the mdat atom in the stream. When Completed, (cref:Stream.Position) is at the
    /// end of the mdat atom.
    /// @param file A (cref:Stream) that (cref:Stream.CanRead), (cref:Stream.CanWrite),
    /// (cref:Stream.CanSeek)
    /// @param shiftVector The size and direction of the shift
    async func ShiftMdatAsync(
        file Stream,
        shiftVector int64,
        progressTracker ProgressTracker? = nil,
        cancellationToken CancellationToken = default(CancellationToken)
    ) {
        await Mpeg4Util.ShiftDataBlock(
            file,
            Header.FilePosition,
            Header.TotalBoxSize,
            shiftVector,
            progressTracker,
            cancellationToken
        )
            .ConfigureAwait(false)
        this.Header.FilePosition += shiftVector
    }

    protected open override func Render(file Stream) {
        throw NotSupportedException()
    }
}
