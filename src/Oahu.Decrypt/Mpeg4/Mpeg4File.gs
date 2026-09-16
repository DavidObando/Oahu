package Oahu.Decrypt.Mpeg4

import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Chunks
import Oahu.Decrypt.Mpeg4.Util
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

open class Mpeg4File : IDisposable {
    private let lazyMetadataItems Lazy[MetadataItems]
    private var disposed int32
    private var timescale int32? = nil
    private var audioChannels int32? = nil
    private var averageBitrate int32? = nil

    convenience init(file Stream) {
        init(file, file.Length)
    }

    convenience init(fileName string, access FileAccess = FileAccess.Read, share FileShare = FileShare.Read) {
        init(File.Open(fileName, FileMode.Open, access, share))
    }

    init(file Stream, fileSize int64) {
        InputStream = if file.CanSeek {
            file
        } else {
            cast[Stream](TrackedReadStream(file, fileSize))
        }
        TopLevelBoxes = Mpeg4Util.LoadTopLevelBoxes(InputStream)
        Ftyp = TopLevelBoxes.OfType[FtypBox]().Single()
        Moov = TopLevelBoxes.OfType[MoovBox]().Single()
        Mdat = TopLevelBoxes.OfType[MdatBox]().Single()
        lazyMetadataItems = Lazy[MetadataItems](() -> MetadataItems(Moov.ILst ?? Moov.CreateEmptyMetadata()))
        AudioSampleEntry = Moov
            .AudioTrack
            .Mdia
            .Minf
            .Stbl
            .Stsd
            .AudioSampleEntry ??
            throw InvalidOperationException("The audio track's AudioSampleEntry is null")
    }

    deinit {
        Dispose(disposing: false)
    }

    prop Chapters ChapterInfo?

    prop InputStream Stream {
        get;
        init;
    }

    prop Ftyp FtypBox

    prop Moov MoovBox {
        get;
        init;
    }

    prop Mdat MdatBox {
        get;
        init;
    }

    prop MetadataItems MetadataItems -> lazyMetadataItems.Value
    open prop Duration TimeSpan -> TimeSpan.FromSeconds(
        float64(Moov.AudioTrack.Mdia.Mdhd.Duration) / float64(TimeScale)
    )
    prop MaxBitrate int32 -> int32((AudioSampleEntry.Esds?.ES_Descriptor.DecoderConfig.MaxBitrate ?? uint32(0)))

    prop AudioSampleEntry AudioSampleEntry {
        get;
        init;
    }

    prop TopLevelBoxes List[IBox] {
        get;
        init;
    }

    prop TimeScale int32 -> (
        if timescale == nil {
            (
                timescale = AudioSampleEntry
                    .Esds
                    ?.ES_Descriptor
                    .DecoderConfig
                    .AudioSpecificConfig
                    .SamplingFrequency ??
                    AudioSampleEntry
                    .Dec3
                    ?.SampleRate ??
                    AudioSampleEntry
                    .Dac4
                    ?.SampleRate ??
                    int32(Moov.AudioTrack.Mdia.Mdhd.Timescale)
            )
        } else {
            timescale
        }
    )!!
    prop AudioChannels int32 -> (
        if audioChannels == nil {
            (
                audioChannels = AudioSampleEntry
                    .Esds
                    ?.ES_Descriptor
                    .DecoderConfig
                    .AudioSpecificConfig
                    .ChannelConfiguration ??
                    AudioSampleEntry
                    .Dec3
                    ?.NumberOfChannels ??
                    AudioSampleEntry
                    .Dac4
                    ?.NumberOfChannels ??
                    int32(AudioSampleEntry.ChannelCount)
            )
        } else {
            audioChannels
        }
    )!!
    prop AverageBitrate int32 -> (
        if averageBitrate == nil {
            (
                averageBitrate = int32(
                    (
                        AudioSampleEntry
                            .Esds
                            ?.ES_Descriptor
                            .DecoderConfig
                            .AverageBitrate ??
                            AudioSampleEntry
                            .Dec3
                            ?.AverageBitrate ??
                            AudioSampleEntry
                            ?.Dac4
                            ?.AverageBitrate ??
                            CalculateBitrate()
                    )
                )
            )
        } else {
            averageBitrate
        }
    )!!
    protected prop Disposed bool -> disposed != 0

    async func SaveAsync(
        keepMoovInFront bool = true,
        progressTracker ProgressTracker? = nil,
        cancellationToken CancellationToken = default(CancellationToken)
    ) {
        if !InputStream.CanRead || !InputStream.CanWrite || !InputStream.CanSeek {
            throw InvalidOperationException("${"InputStream"} must be readable, writable and seekable to save")
        }
        // Remove Free boxes and work with net size change
        for box in Moov.GetFreeBoxes() {
            box.Parent?.Children.Remove(box)
        }
        this.InputStream.Position = 0
        let moovInFront = Moov.Header.FilePosition < Mdat.Header.FilePosition
        if moovInFront {
            var totalSizeChange = Ftyp.RenderSize + Moov.RenderSize - Mdat.Header.FilePosition
            if totalSizeChange == int64(0) {
                Ftyp.Save(InputStream)
                Moov.Save(InputStream)
            } else if int64(FreeBox.MinSize) + totalSizeChange <= int64(0) {
                // Ftyp + Moov shrank more than FreeBox.MinSize
                // We can accomodate the change with a Free box
                Ftyp.Save(InputStream)
                Moov.Save(InputStream)
                FreeBox.Create(-totalSizeChange, nil).Save(InputStream)
            } else {
                // Ftyp + Moov either grew, or they shrank less than FreeBox.MinSize
                if keepMoovInFront {
                    // Shift Mdat by totalSizeChange to fit the new Moov exactly.
                    totalSizeChange = Moov.ShiftChunkOffsetsWithMoovInFront(totalSizeChange)
                    await Mdat.ShiftMdatAsync(InputStream, totalSizeChange, progressTracker, cancellationToken)
                    this.InputStream.Position = 0
                    Ftyp.Save(InputStream)
                    Moov.Save(InputStream)
                    InputStream.SetLength(Mdat.Header.FilePosition + Mdat.Header.TotalBoxSize)
                } else {
                    // Replace the moov with a free box and write the moov at the end
                    let freeBoxSize = Mdat.Header.FilePosition - Ftyp.RenderSize
                    if freeBoxSize < int64(8) {
                        // The only way this can happen is if the ftyp grew so much that it now exceeds the
                        // original ftyp + moov box sizes, which should never happen since ftyp is supposed
                        // to be on the order of a few dozen kilobytes in size.
                        throw InvalidOperationException("Not enough space to write ftyp box before mdat box")
                    }
                    Ftyp.Save(InputStream)
                    FreeBox.Create(freeBoxSize, nil).Save(InputStream)
                    this.InputStream.Position = Mdat.Header.FilePosition + Mdat.Header.TotalBoxSize
                    Moov.Save(InputStream)
                }
            }
        } else {
            // Moov is at the end of the file
            var rewriteMoovAtEnd = true
            let ftypSizeChange = Ftyp.RenderSize - Ftyp.Header.TotalBoxSize
            if ftypSizeChange == int64(0) {
                Ftyp.Save(InputStream)
            } else if int64(FreeBox.MinSize) + ftypSizeChange <= int64(0) {
                // Ftyp shrank more than FreeBox.MinSize
                // We can accomodate the change with a Free box
                Ftyp.Save(InputStream)
                FreeBox.Create(-ftypSizeChange, nil).Save(InputStream)
            } else {
                // Ftyp either grew or it shrank less than FreeBox.MinSize. We have to shift the mdat.
                if keepMoovInFront {
                    // The Moov is at the end, but since we're shifting the entire mdat anway,
                    // we might as well rewrite the moov at the beginning place
                    var shiftVector = ftypSizeChange + Moov.RenderSize
                    shiftVector = Moov.ShiftChunkOffsetsWithMoovInFront(shiftVector)
                    await Mdat.ShiftMdatAsync(InputStream, shiftVector, progressTracker, cancellationToken)
                    this.InputStream.Position = 0
                    Ftyp.Save(InputStream)
                    Moov.Save(InputStream)
                    InputStream.SetLength(Mdat.Header.FilePosition + Mdat.Header.TotalBoxSize)
                    rewriteMoovAtEnd = false
                } else {
                    // Shift mdat to accomodate ftyp size change
                    // Since Moov is being re-written at the end, we don't need to worry about the stco/co64
                    // conversion changing the size of the moov box. Moov gets rewritten at the end anyway.
                    Moov.ShiftChunkOffsets(ftypSizeChange)
                    await Mdat.ShiftMdatAsync(InputStream, ftypSizeChange, progressTracker, cancellationToken)
                    this.InputStream.Position = 0
                    Ftyp.Save(InputStream)
                }
            }
            if rewriteMoovAtEnd {
                // Go to the end of the mdat and re-write the moov.
                this.InputStream.Position = Mdat.Header.FilePosition + Mdat.Header.TotalBoxSize
                Moov.Save(InputStream)
                InputStream.SetLength(InputStream.Position)
            }
        }
        await InputStream.FlushAsync(cancellationToken)
    }

    func GetChaptersFromMetadata() ChapterInfo? {
        let textTrak TrakBox? = Moov.TextTrack
        // Get chapter names from metadata box in chapter track
        let chapterNames List[string]? = textTrak
            ?.GetChild[UdtaBox]()
            ?.GetChild[MetaBox]()
            ?.GetChild[AppleListBox]()
            ?.Children
            ?.OfType[AppleTagBox]()
            ?.Where((b AppleTagBox) -> b.Header.Type == "©nam")
            ?.Select((b AppleTagBox) -> b.Data.ReadAsString())
            ?.ToList()
        if chapterNames == nil {
            return nil
        }
        let sampleTimes = textTrak!!.Mdia.Minf.Stbl.Stts.Samples
        if sampleTimes.Count != chapterNames.Count {
            return nil
        }
        let cEntryList = ChunkEntryList(textTrak!!).OrderBy((s ChunkEntry) -> s.ChunkOffset).ToList()
        if cEntryList.Count != chapterNames.Count {
            return nil
        }
        let chapterInfo = ChapterInfo()
        var subtractNext = 0
        for var i = 0; i < chapterNames.Count; i++ {
            let sif = int32(sampleTimes[i].FrameDelta)
            let duration = TimeSpan.FromSeconds(Math.Max(0d, sif + subtractNext) / float64(TimeScale))
            chapterInfo.AddChapter(chapterNames[int32(cEntryList[i].ChunkIndex)], duration)
            subtractNext = if sif < 0 {
                sif
            } else {
                0
            }
        }
        Chapters ??= chapterInfo
        return chapterInfo
    }

    func Dispose() {
        Dispose(disposing: true)
        GC.SuppressFinalize(this)
    }

    protected open func CalculateBitrate() uint32 {
        let totalSize = Moov.AudioTrack.Mdia.Minf.Stbl.Stsz?.TotalSize
        return if !(totalSize != nil) || totalSize!!== int64(0) {
            uint32(0)
        } else {
            uint32(Math.Round(float64(totalSize!!* int64(8)) / Duration.TotalSeconds, 0))
        }
    }

    protected open func Dispose(disposing bool) {
        if disposing && Interlocked.CompareExchange(&disposed, 1, 0) == 0 {
            InputStream.Dispose()
            for box in TopLevelBoxes {
                box.Dispose()
            }
        }
    }

    shared {
        async func RelocateMoovToBeginningAsync(
            mp4FilePath string,
            progressTracker ProgressTracker? = nil,
            cancellationToken CancellationToken = default(CancellationToken)
        ) {
            var boxes List[IBox]
            {
                using let fileStream = File.OpenRead(mp4FilePath)
                boxes = Mpeg4Util.LoadTopLevelBoxes(fileStream)
            }
            try {
                let ftypeSize = boxes.OfType[FtypBox]().Single().RenderSize
                let moov = boxes.OfType[MoovBox]().Single()
                if progressTracker != nil {
                    progressTracker.TotalDuration = TimeSpan.FromSeconds(
                        float64(moov.Mvhd.Duration) / float64(moov.Mvhd.Timescale)
                    )
                    if moov.Header.FilePosition == ftypeSize {
                        // Moov is already at the beginning, immidately following ftyp.
                        progressTracker.MovedBytes = (progressTracker.TotalSize = 1)
                        return
                    }
                }
                let mdat = boxes.OfType[MdatBox]().Single()
                // Figure out how much mdat must be shifted to make room for moov at the beginning.
                let toShift = ftypeSize + moov.RenderSize - mdat.Header.FilePosition
                let shifted = moov.ShiftChunkOffsetsWithMoovInFront(toShift)
                using let mpegFile = FileStream(mp4FilePath, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite)
                await mdat.ShiftMdatAsync(mpegFile, shifted, progressTracker, cancellationToken)
                mpegFile.Position = ftypeSize
                moov.Save(mpegFile)
                mpegFile.SetLength(mpegFile.Position + mdat.Header.TotalBoxSize)
            } finally {
                for box in boxes {
                    box.Dispose()
                }
            }
        }
    }
}
