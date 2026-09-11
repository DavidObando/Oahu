package Oahu.Decrypt

import Oahu.Decrypt.FrameFilters
import Oahu.Decrypt.Mpeg4
import System
import System.Collections.Generic
import System.Diagnostics.CodeAnalysis
import System.IO
import System.Text
import SystemObject = System.Object

class ChapterEntry {
    init(title string) {
        ArgumentNullException.ThrowIfNull(title, "title")
        Title = title
    }

    prop FrameData Memory[uint8] {
        get;
        init;
    }

    prop SamplesInFrame uint32 {
        get;
        init;
    }

    prop Title string {
        get;
        init;
    }
}

/// Chapters to be written to an mp4 file.
class ChapterQueue {
    private let sampleScaleFactor float64
    private let outputSampleRate SampleRate
    private let lockObj object = SystemObject()
    private let chapterEntries Queue[ChapterEntry] = Queue[ChapterEntry]()
    private var subtractNext int32 = 0

    init(inputRate SampleRate, outputRate SampleRate) {
        outputSampleRate = outputRate
        sampleScaleFactor = float64(outputRate) / float64(inputRate)
    }

    func TryGetNextChapter(@NotNullWhen(true) out chapterEntry ChapterEntry?) bool {
        lock lockObj {
            if chapterEntries.Count > 0 {
                chapterEntry = chapterEntries.Dequeue()
                return true
            }
        }
        chapterEntry = nil
        return false
    }

    func AddRange(chapters IEnumerable[Chapter]) {
        for ch in chapters {
            Add(ch)
        }
    }

    /// Add a user-defined chapter
    func Add(chapter Chapter) {
        let frameData = [chapter.RenderSize]uint8
        using let ms = MemoryStream(frameData)
        chapter.WriteChapter(ms)
        let sampleDelta = uint32((chapter.Duration.TotalSeconds * float64(int32(outputSampleRate))))
        lock lockObj {
            chapterEntries.Enqueue(ChapterEntry(chapter.Title){FrameData = frameData, SamplesInFrame = sampleDelta})
        }
    }

    /// Add a chapter read directly from the timed text track.
    func Add(entry FrameEntry) {
        let frameData ReadOnlySpan[uint8] = entry.FrameData.Span
        var title = string.Empty
        if frameData.Length >= 2 {
            // MPEG-4 timed text format: [2-byte big-endian length] [UTF-8 text] [optional style atoms]
            var size = (int32(frameData[0]) << 8) | int32(frameData[1])
            // Guard against malformed or unusual text samples where the declared
            // size exceeds the available frame data.
            if size > frameData.Length - 2 {
                size = frameData.Length - 2
            }
            if size > 0 {
                title = Encoding.UTF8.GetString(frameData.Slice(2, size))
            }
        }
        // Takes care of 'negative' sample deltas in malformed Stts entries (e.g. Broken Angels)
        let sif = int32(entry.SamplesInFrame)
        lock lockObj {
            chapterEntries.Enqueue(
                ChapterEntry(title){
                    FrameData = entry.FrameData,
                    SamplesInFrame = uint32((float64(Math.Max(0, sif + subtractNext)) * sampleScaleFactor))
                }
            )
        }
        subtractNext = if sif < 0 {
            sif
        } else {
            0
        }
    }
}
