package Oahu.Cli.Tests.App

import Oahu.Decrypt.Mpeg4.ID3
import System.IO
import Xunit

class Id3CompatibilityTests {
    @Fact
    func Clearing_One_Id3_Flag_Preserves_All_Other_Bits() {
        let flags = Flags(uint16(0xffff))
        flags[1] = false
        Assert.Equal([]uint8{0xbf, 0xff}, flags.ToBytes())
        flags[1] = true
        Assert.Equal([]uint8{0xff, 0xff}, flags.ToBytes())
    }

    @Theory
    @InlineData(0x300)
    @InlineData(0x400)
    func Frame_Identifier_Size_And_Flags_Survive_Rendering_And_Parsing(version int32) {
        let header = FrameHeader("TIT2", uint16(0x4000), uint16(version))
        using let stream = MemoryStream()
        header.Render(stream, 42, uint16(version))
        stream.Position = 0
        let parsed = FrameHeader.Create(stream, uint16(version))
        Assert.Equal("TIT2", parsed.Identifier)
        Assert.Equal(42, parsed.Size)
        Assert.Equal(header.Flags.ToBytes(), parsed.Flags.ToBytes())
    }
}
