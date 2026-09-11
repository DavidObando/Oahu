package Oahu.Decrypt

import Oahu.Decrypt.Chunks
import Oahu.Decrypt.FrameFilters
import Oahu.Decrypt.FrameFilters.Audio
import Oahu.Decrypt.FrameFilters.Text
import Oahu.Decrypt.Mpeg4
import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Util
import System
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

enum FileType {
    Aax,
    Aaxc,
    Mpeg4,
    Dash
}

enum SampleRate {
    Hz_96000 = 96000,
    Hz_88200 = 88200,
    Hz_64000 = 64000,
    Hz_48000 = 48000,
    Hz_44100 = 44100,
    Hz_32000 = 32000,
    Hz_24000 = 24000,
    Hz_22050 = 22050,
    Hz_16000 = 16000,
    Hz_12000 = 12000,
    Hz_11025 = 11025,
    Hz_8000 = 8000,
    Hz_7350 = 7350
}

open class Mp4File : Mpeg4File {
    init(file Stream, fileSize int64) : base(file, fileSize) {
        FileType = if Ftyp.CompatibleBrands.Any((b string) -> b == "dash") {
            FileType.Dash
        } else {
            (
                switch Ftyp.MajorBrand {
                    case "aax ": FileType.Aax
                    case "aaxc": FileType.Aaxc
                    default: FileType.Mpeg4
                }
            )
        }
    }

    convenience init(file Stream) {
        init(file, file.Length)
    }

    convenience init(fileName string, access FileAccess = FileAccess.Read, share FileShare = FileShare.Read) {
        init(File.Open(fileName, FileMode.Open, access, share))
    }

    prop FileType FileType {
        get;
        init;
    }

    prop SampleRate SampleRate -> SampleRate(TimeScale)

    open func GetAudioFrameFilter() FrameTransformBase[FrameEntry, FrameEntry] -> AacValidateFilter()

    /// Save all metadata changes to the input stream. Stream must be readable, writable, and seekable.
    /// @param keepMoovInFront Controls where the (cref:MoovBox) is saved when the (cref:MoovBox) is in the
    /// beginning of the file but there is not enough space to save it in the same position.
    ///
    ///
    /// if (cref:true), the (cref:MdatBox) is shifted to make room for the (cref:MoovBox).
    ///
    ///
    /// if (cref:false), the original (cref:MoovBox) is replaced with a (cref:FreeBox) and the new
    /// (cref:MoovBox) is written at the end of the file.
    func SaveAsync(keepMoovInFront bool = true) Mp4Operation {
        let tracker = ProgressTracker{TotalDuration: Duration}
        let operation = Mp4Operation(
            (t CancellationTokenSource) -> SaveAsync(keepMoovInFront, tracker, t.Token),
            this,
            (t Task) -> { }
        )
        tracker.ProgressUpdated += (_ object?, _ EventArgs) -> operation.OnProgressUpdate(
            ConversionProgressEventArgs(TimeSpan.Zero, tracker.TotalDuration, tracker.Position, tracker.Speed)
        )
        return operation
    }

    func ConvertToMp4aAsync(outputStream Stream, userChapters ChapterInfo? = nil) Mp4Operation {
        let start = userChapters?.StartOffset ?? TimeSpan.Zero
        let end = userChapters?.EndOffset ?? TimeSpan.MaxValue
        let chapterQueue = ChapterQueue(SampleRate, SampleRate)
        if userChapters != nil {
            if Moov.TextTrack == nil {
                Moov.CreateEmptyTextTrack()
            }
            chapterQueue.AddRange(userChapters)
        }
        let filter1 = GetAudioFrameFilter()
        let filter2 = LosslessFilter(outputStream, this, chapterQueue)
        filter1.LinkTo(filter2)
        if Moov.TextTrack != nil && userChapters == nil {
            let c1 = ChapterFilter()
            c1.ChapterRead += (_ object?, e FrameEntry) -> chapterQueue.Add(e)
            let Continuation = func (t Task) {
                filter1.Dispose()
                c1.Dispose()
                outputStream.Close()
            }
            return ProcessAudio(start, end, Continuation, (Moov.AudioTrack, filter1), (Moov.TextTrack!!, c1))
        } else {
            let Continuation = func (t Task) {
                filter1.Dispose()
                outputStream.Close()
            }
            return ProcessAudio(start, end, Continuation, (Moov.AudioTrack, filter1))
        }
    }

    func ConvertToMultiMp4aAsync(userChapters ChapterInfo, newFileCallback(NewSplitCallback) -> void) Mp4Operation {
        let f1 = GetAudioFrameFilter()
        let f2 = LosslessMultipartFilter(userChapters, Ftyp, Moov, newFileCallback)
        f1.LinkTo(f2)
        let Continuation = func (t Task) {
            f1.Dispose()
        }
        return ProcessAudio(userChapters.StartOffset, userChapters.EndOffset, Continuation, (Moov.AudioTrack, f1))
    }

    func GetChapterInfoAsync() Mp4Operation[ChapterInfo?] {
        if Moov.TextTrack is not TrakBox textTrack {
            return Mp4Operation[ChapterInfo?].FromCompleted(this, nil)
        }
        let chapterFilter = ChapterFilter()
        let chapterQueue = ChapterQueue(SampleRate, SampleRate)
        chapterFilter.ChapterRead += (s object?, e FrameEntry) -> chapterQueue.Add(e)
        let Continuation = func (t Task) ChapterInfo? {
            let chapters = ChapterInfo()
            while chapterQueue.TryGetNextChapter(out var ch) {
                chapters.AddChapter(
                    ch!!.Title,
                    TimeSpan.FromSeconds(float64(ch!!.SamplesInFrame) / float64(SampleRate))
                )
            }
            chapterFilter.Dispose()
            Chapters ??= chapters
            return chapters
        }
        return ProcessAudio(TimeSpan.Zero, TimeSpan.MaxValue, Continuation, (Moov.TextTrack!!, chapterFilter))
    }

    open func ProcessAudio(
        startTime TimeSpan,
        endTime TimeSpan,
        continuation(Task) -> void,
        filters ...(Track TrakBox, Filter FrameFilterBase[FrameEntry])
    ) Mp4Operation {
        let reader = CreateChunkReader(InputStream, startTime, Min(Duration, endTime))
        for (track, filter) in filters {
            reader.AddTrack(track, filter)
        }
        let operation = Mp4Operation(reader.RunAsync, this, continuation)
        reader.OnProgressUpdateDelegate = operation.OnProgressUpdate
        return operation
    }

    func ProcessAudio[TResult](
        startTime TimeSpan,
        endTime TimeSpan,
        continuation(Task) -> TResult,
        filters ...(Track TrakBox, Filter FrameFilterBase[FrameEntry])
    ) Mp4Operation[TResult] {
        let reader = CreateChunkReader(InputStream, startTime, Min(Duration, endTime))
        for (track, filter) in filters {
            reader.AddTrack(track, filter)
        }
        let operation = Mp4Operation[TResult](reader.RunAsync, this, continuation)
        reader.OnProgressUpdateDelegate = operation.OnProgressUpdate
        return operation
    }

    protected open func CreateChunkReader(
        inputStream Stream,
        startTime TimeSpan,
        endTime TimeSpan
    ) IChunkReader -> ChunkReader(inputStream, startTime, endTime)

    shared {
        func RelocateMoovAsync(mp4FilePath string) Mp4Operation {
            let tracker = ProgressTracker()
            let moovMover Mp4Operation? = Mp4Operation(
                (t CancellationTokenSource) -> Mpeg4File.RelocateMoovToBeginningAsync(mp4FilePath, tracker, t.Token),
                nil,
                (t Task) -> { }
            )
            tracker.ProgressUpdated += (_ object?, _ EventArgs) -> moovMover!!.OnProgressUpdate(
                ConversionProgressEventArgs(TimeSpan.Zero, tracker.TotalDuration, tracker.Position, tracker.Speed)
            )
            return moovMover!!
        }

        private func Min(t1 TimeSpan, t2 TimeSpan) TimeSpan -> if t1 > t2 {
            t2
        } else {
            t1
        }
    }
}
