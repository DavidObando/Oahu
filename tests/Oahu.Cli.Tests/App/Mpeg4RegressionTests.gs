package Oahu.Cli.Tests.App

import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Util
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Threading
import System.Threading.Tasks
import Xunit

class Mpeg4RegressionTests {
    @Fact
    func Saving_Stsz_Does_Not_Mutate_Sizes_And_Is_Repeatable() {
        using let parent = Container(BoxHeader(8, "moov"))
        let sizes = List[int32]{70000, 80000, 90000}
        let box = StszBox.CreateBlank(parent, sizes)
        using let first = MemoryStream()
        using let second = MemoryStream()
        box.Save(first)
        Assert.Equal(240000L, box.TotalSize)
        Assert.Equal(70000, box.GetSizeAtIndex(0))
        box.Save(second)
        Assert.Equal(first.ToArray(), second.ToArray())
        first.Position = 0
        let loaded = StszBox(first, BoxHeader(first), nil)
        Assert.Equal(240000L, loaded.TotalSize)
    }

    @Fact
    func Constant_Sample_Size_Uses_Wide_Multiplication_And_No_Table() {
        using let source = MemoryStream()
        source.WriteInt32BE(0)
        source.WriteInt32BE(1000000000)
        source.WriteInt32BE(3)
        source.Position = 0
        let box = StszBox(source, BoxHeader(20, "stsz"), nil)
        Assert.Equal(3000000000L, box.TotalSize)
        using let output = MemoryStream()
        box.Save(output)
        Assert.Equal(box.RenderSize, output.Length)
        Assert.Equal(20L, output.Length)
    }

    @Theory
    @InlineData(4)
    @InlineData(8)
    @InlineData(16)
    func Compact_Sample_Tables_Roundtrip_Without_Mutation(fieldSize int32) {
        using let input = MemoryStream()
        input.WriteInt32BE(0)
        input.WriteInt32BE(fieldSize)
        input.WriteInt32BE(3)
        if fieldSize == 4 {
            input.Write([]uint8{0x12, 0x30})
        } else if fieldSize == 8 {
            input.Write([]uint8{1, 2, 3})
        } else {
            input.WriteUInt16BE(1000)
            input.WriteUInt16BE(2000)
            input.WriteUInt16BE(3000)
        }
        input.Position = 0
        let box = Stz2Box(input, BoxHeader(input.Length + 8L, "stz2"), nil)
        let total = box.TotalSize
        using let first = MemoryStream()
        using let second = MemoryStream()
        box.Save(first)
        Assert.Equal(total, box.TotalSize)
        box.Save(second)
        Assert.Equal(first.ToArray(), second.ToArray())
        Assert.Equal(box.RenderSize, first.Length)
        first.Position = 0
        let loaded = Stz2Box(first, BoxHeader(first), nil)
        Assert.Equal(total, loaded.TotalSize)
        Assert.Equal(fieldSize, loaded.FieldSize)
        Assert.Equal(box.SampleSizes, loaded.SampleSizes)
    }

    @Fact
    func Extended_Box_Declares_Actual_Header_Length() {
        using let box = Container(BoxHeader(int64(uint32.MaxValue) + 1L, "moov"))
        using let output = MemoryStream()
        box.Save(output)
        output.Position = 0
        let header = BoxHeader(output)
        Assert.Equal(16L, output.Length)
        Assert.Equal(output.Length, header.TotalBoxSize)
    }

    @Fact
    async func Chunk_Read_Fills_Buffer_Across_Short_Reads_And_Detects_Real_Eof() {
        let bytes = []uint8{1, 2, 3, 4, 5}
        using let stream = ShortReadStream(bytes)
        let buffer = [5]uint8
        await stream.ReadNextChunkAsync(0L, buffer.AsMemory(), CancellationToken.None)
        Assert.Equal(bytes, buffer)
        stream.Position = 0
        await Assert.ThrowsAsync[EndOfStreamException](
            async () -> await stream.ReadNextChunkAsync(0L, [6]uint8, CancellationToken.None)
        )
    }

    @Fact
    func Sha1_Accepts_An_Empty_Block_Sequence() {
        Assert.Equal("DA39A3EE5E6B4B0D3255BFEF95601890AFD80709", Convert.ToHexString(Crypto.Sha1()))
    }

    private class Container : Box {
        init(header BoxHeader) : base(header, nil) { }
        protected override func Render(file Stream) { }
    }

    private class ShortReadStream : MemoryStream {
        init(bytes[]uint8) : base(bytes) { }
        override func ReadAsync(buffer Memory[uint8], cancellationToken CancellationToken = default(CancellationToken)) ValueTask[int32] {
            return base.ReadAsync(buffer[.. Math.Min(2, buffer.Length)], cancellationToken)
        }
    }
}
