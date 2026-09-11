package Oahu.Decrypt.Chunks

import Oahu.Decrypt
import Oahu.Decrypt.FrameFilters
import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Chunks
import Oahu.Decrypt.Mpeg4.Util
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks

interface IChunkReader {
    prop OnProgressUpdateDelegate((ConversionProgressEventArgs) -> void)?
    func RunAsync(cancellationSource CancellationTokenSource) Task;

    func AddTrack(track TrakBox, filter FrameFilterBase[FrameEntry]);
}

internal open class ChunkReader : IChunkReader {
    private var beginProcess DateTime
    private var nextUpdate DateTime

    init(inputStream Stream, startTime TimeSpan, endTime TimeSpan) {
        TrackEntries = Dictionary[uint32, TrackEntry]()
        InputStream = inputStream
        if startTime >= endTime {
            throw ArgumentException("Start time must be less than end time.", "startTime")
        }
        StartTime = startTime
        EndTime = endTime
    }

    prop OnProgressUpdateDelegate((ConversionProgressEventArgs) -> void)?

    protected prop TrackEntries Dictionary[uint32, TrackEntry] {
        get;
        init;
    }

    protected prop InputStream Stream {
        get;
        init;
    }

    protected prop StartTime TimeSpan {
        get;
        init;
    }

    protected prop EndTime TimeSpan {
        get;
        init;
    }

    open func AddTrack(track TrakBox, filter FrameFilterBase[FrameEntry]) {
        let trackEntry = TrackEntry(track.Tkhd.TrackID, track.Mdia.Mdhd.Timescale, filter, track)
        TrackEntries.Add(track.Tkhd.TrackID, trackEntry)
    }

    async func RunAsync(cancellationSource CancellationTokenSource) {
        // All filters share the came cancellation source.
        for filter in TrackEntries.Values.Select((e TrackEntry) -> e.FirstFilter) {
            filter.SetCancellationToken(cancellationSource.Token)
        }
        OnInitialProgress()
        let token = cancellationSource.Token
        try {
            for c in EnumerateChunks() {
                let chunkData Memory[uint8] = [c.ChunkSize]uint8
                await InputStream.ReadNextChunkAsync(c.ChunkOffset, chunkData, token)
                await DispatchChunk(c, chunkData, token)
            }
        } catch (OperationCanceledException) { } catch {
            cancellationSource.Cancel()
            rethrow
        } finally {
            OnFinalProgress()
            // Always call CompleteAsync() on all filters so that every
            // FilterLoop gets awaited and any exceptions are thrown.
            await Task.WhenAll(TrackEntries.Values.Select((e TrackEntry) -> e.FirstFilter.CompleteAsync()))
        }
    }

    protected open func EnumerateChunks() IEnumerable[ChunkEntry] {
        let ChunkHasFrameInRange = func (value ChunkEntry) bool {
            let timeScale = GetTrackEntryFromId(value.TrackId).Timescale
            let minimumSample = StartTime.TotalSeconds * float64(timeScale)
            let maximumSample = EndTime.TotalSeconds * float64(timeScale)
            return float64(value.FirstSample) <= maximumSample &&
                float64(
                (
                    value.FirstSample + value.FrameDurations.Sum(
                        func (d uint32) int64 {
                            return d
                        }
                    )
                )
            ) >= minimumSample
        }
        return TrackEntries
            .Values
            .Select((e TrackEntry) -> e.TrakBox)
            .InterleaveBy((t TrakBox) -> t.ChunkEntries(), (t ChunkEntry) -> t.ChunkOffset)
            .Where(ChunkHasFrameInRange)
    }

    protected func GetTrackEntryFromId(trackId uint32) TrackEntry -> if TrackEntries.TryGetValue(
        trackId,
        out var trackEntry
    ) {
        trackEntry
    } else {
        throw ArgumentOutOfRangeException(
            "trackId",
            "Track ID $trackId is not present in this ${"ChunkReader"} instance."
        )
        default(TrackEntry)
    }

    protected open func CreateFrameEntry(
        chunk ChunkEntry,
        frameInChunk int32,
        frameDelta uint32,
        frameData Memory[uint8]
    ) FrameEntry -> FrameEntry{Chunk: chunk, SamplesInFrame: frameDelta, FrameData: frameData}

    private async func DispatchChunk(chunk ChunkEntry, chunkData Memory[uint8], token CancellationToken) {
        var sampleIndex = chunk.FirstSample
        let trackEntry = GetTrackEntryFromId(chunk.TrackId)
        let startSample = int64((StartTime.TotalSeconds * float64(trackEntry.Timescale)))
        let endSample = int64((EndTime.TotalSeconds * float64(trackEntry.Timescale)))
        var frameDelta uint32
        {
            var start = 0
            var f = 0
            while f < chunk.FrameSizes.Length {
                frameDelta = chunk.FrameDurations[f]
                if startSample >= sampleIndex + int64(frameDelta) {
                    {
                        start += chunk.FrameSizes[f]
                        f++
                        sampleIndex += int64(frameDelta)
                        continue
                    }
                }
                if endSample < sampleIndex {
                    break
                }
                OnProgressReport(sampleIndex, trackEntry.Timescale)
                let frameData = chunkData.Slice(start, chunk.FrameSizes[f])
                let frameEntry = CreateFrameEntry(chunk, f, frameDelta, frameData)
                token.ThrowIfCancellationRequested()
                await trackEntry.FirstFilter.AddInputAsync(frameEntry)
                start += chunk.FrameSizes[f]
                f++
                sampleIndex += int64(frameDelta)
            }
        }
    }

    private func OnInitialProgress() {
        beginProcess = DateTime.UtcNow
        nextUpdate = beginProcess
        OnProgressUpdateDelegate?(ConversionProgressEventArgs(StartTime, EndTime, StartTime, 0.0))
    }

    private func OnFinalProgress() {
        OnProgressUpdateDelegate?(
            ConversionProgressEventArgs(
                StartTime,
                EndTime,
                EndTime,
                (EndTime - StartTime) / (DateTime.UtcNow - beginProcess)
            )
        )
    }

    private func OnProgressReport(sampleNumber int64, timeScale uint32) {
        // Throttle update so it doesn't bog down UI
        if DateTime.UtcNow > nextUpdate {
            let trackPosition = TimeSpan.FromSeconds(float64(sampleNumber) / float64(timeScale))
            let speed = (trackPosition - StartTime) / (DateTime.UtcNow - beginProcess)
            OnProgressUpdateDelegate?(ConversionProgressEventArgs(StartTime, EndTime, trackPosition, speed))
            nextUpdate = DateTime.UtcNow.AddMilliseconds(100.0)
        }
    }

    protected open data class TrackEntry(
        TrackId uint32,
        Timescale uint32,
        FirstFilter FrameFilterBase[FrameEntry],
        TrakBox TrakBox
    ) { }
}
