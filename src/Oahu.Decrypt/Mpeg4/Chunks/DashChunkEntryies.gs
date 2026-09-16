package Oahu.Decrypt.Mpeg4.Chunks

import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Util
import System
import System.Collections
import System.Collections.Generic
import System.IO
import System.Linq

class DashChunkEntryies : IEnumerable[ChunkEntry] {
    init(
        inputStream Stream,
        trakId uint32,
        sidx SidxBox,
        firstMoof MoofBox,
        firstMdat MdatBox,
        minimumSample int64,
        maximumSample int64
    ) {
        InputStream = inputStream
        TrackId = trakId
        Sidx = sidx
        FirstMoof = firstMoof
        FirstMdat = firstMdat
        MinimumSample = minimumSample
        MaximumSample = maximumSample
    }

    private prop InputStream Stream {
        get;
        init;
    }

    private prop TrackId uint32 {
        get;
        init;
    }

    private prop FirstMoof MoofBox {
        get;
        init;
    }

    private prop FirstMdat MdatBox {
        get;
        init;
    }

    private prop Sidx SidxBox {
        get;
        init;
    }

    private prop MinimumSample int64 {
        get;
        init;
    }

    private prop MaximumSample int64 {
        get;
        init;
    }

    func GetEnumerator() IEnumerator[ChunkEntry] -> EnumerateChunks().GetEnumerator()

    private func (IEnumerable) GetEnumerator() IEnumerator -> GetEnumerator()

    private func EnumerateChunks() sequence[ChunkEntry] {
        SkipToFirstMoof(out var moofBox, out var mdatBox, out var startSample)
        let totalDataSize = Sidx.Segments.Sum((s SidxBox.Segment) -> int64(s.ReferenceSize))
        let endOfFile = FirstMoof.Header.FilePosition + totalDataSize
        while InputStream.Position < endOfFile {
            if startSample > MaximumSample {
                yield break // No more samples in range

            }
            let trackChunk = ValidateMdatSize(moofBox, mdatBox, startSample)
            startSample += trackChunk.FrameDurations.Sum(
                func (d uint32) int64 {
                    return d
                }
            )
            if startSample > MinimumSample {
                yield trackChunk
            } else {
                // Skip over mdat to next moof
                let endOfMdat = InputStream.Position + mdatBox.Header.TotalBoxSize - int64(mdatBox.Header.HeaderSize)
                InputStream.SeekToOffset(endOfMdat)
            }
            if InputStream.Position < endOfFile {
                moofBox = BoxFactory.CreateBox[MoofBox](InputStream, parent: nil)
                mdatBox = BoxFactory.CreateBox[MdatBox](InputStream, parent: nil)
            }
        }
    }

    private func ValidateMdatSize(moofBox MoofBox, mdatBox MdatBox, startSample int64) ChunkEntry {
        if moofBox.Traf.Trun is not TrunBox trun {
            throw InvalidDataException("The ${"TrafBox"} doesn't contain a ${"TrunBox"}")
        }
        let frameSizes = if trun.SampleSizePresent {
            trun.Samples.Select((s TrunBox.SampleInfo) -> s.SampleSize).OfType[int32]().ToArray()
        } else {
            (
                if moofBox.Traf.Tfhd.DefaultSampleSize is uint32 sampleSize {
                    Enumerable.Repeat(int32(sampleSize), trun.Samples.Length).ToArray()
                } else {
                    throw InvalidOperationException(
                        "Trun sample infos don't contain sample sizes and no default sample size is set."
                    )
                    default([]int32)
                }
            )
        }
        let mdatSize = mdatBox.Header.TotalBoxSize - int64(mdatBox.Header.HeaderSize)
        if int64(frameSizes.Sum()) != mdatSize {
            throw InvalidDataException("Mdat box size doesn't match sample sizes in track fragment")
        }
        if mdatSize > int64(int32.MaxValue) {
            throw InvalidDataException("Mdat is larger than Int32.MaxValue")
        }
        let frameDurations = if trun.SampleDurationPresent {
            trun.Samples.Select((s TrunBox.SampleInfo) -> s.SampleDuration).OfType[uint32]().ToArray()
        } else {
            (
                if moofBox.Traf.Tfhd.DefaultSampleDuration is uint32 sampleDuration {
                    Enumerable.Repeat(sampleDuration, trun.Samples.Length).ToArray()
                } else {
                    throw InvalidOperationException(
                        "Trun sample infos don't contain sample durations and no default sample duration is set."
                    )
                    default([]uint32)
                }
            )
        }
        if frameDurations.Length != frameSizes.Length {
            throw InvalidDataException(
                "The number of frame sizes (${frameSizes.Length}) does not match the number of durations (${frameDurations.Length}) in fragment ${moofBox.Mfhd.SequenceNumber}"
            )
        }
        var extraData object? = nil
        if moofBox.Traf.Senc is {} senc {
            extraData = if frameSizes.Length == senc.IVs.Length {
                senc.IVs
            } else {
                throw InvalidDataException(
                    "The number of IVs (${senc.IVs.Length}) does not match the number of samples (${frameSizes.Length}) in fragment ${moofBox.Mfhd.SequenceNumber}"
                )
                default([][]uint8)
            }
        }
        return ChunkEntry{
            TrackId: TrackId,
            ChunkIndex: uint32(moofBox.Mfhd.SequenceNumber),
            ChunkOffset: InputStream.Position,
            ChunkSize: int32(mdatSize),
            FirstSample: startSample,
            FrameSizes: frameSizes,
            FrameDurations: frameDurations,
            ExtraData: extraData
        }
    }

    private func SkipToFirstMoof(out firstMoof MoofBox, out firstMdat MdatBox, out firstSample int64) {
        let startPosition = FirstMoof.Header.FilePosition
        var dataOffset int64 = 0
        firstSample = 0
        if Sidx.Segments.Any(
            (s SidxBox.Segment) -> s.ReferenceType || !s.StartsWithSAP || s.SapType != 1 || s.SapDeltaTime != 0
        ) {
            throw InvalidOperationException(
                "AAXClean doesn't know how to inrepret segment index boxes other than " +
                    "${"SapType"} = 1, " +
                    "${"SapDeltaTime"} = 0, " +
                    "${"StartsWithSAP"} = 1, " +
                    "${"ReferenceType"} = 0"
            )
        }
        for segment in Sidx.Segments {
            if MinimumSample < firstSample + int64(segment.SubsegmentDuration) {
                break
            }
            dataOffset += int64(segment.ReferenceSize)
            firstSample += int64(segment.SubsegmentDuration)
        }
        if dataOffset == int64(0) {
            firstMoof, firstMdat = FirstMoof, FirstMdat
        } else {
            InputStream.SeekToOffset(startPosition + dataOffset)
            firstMoof = BoxFactory.CreateBox[MoofBox](InputStream, parent: nil)
            firstMdat = BoxFactory.CreateBox[MdatBox](InputStream, parent: nil)
        }
    }
}
