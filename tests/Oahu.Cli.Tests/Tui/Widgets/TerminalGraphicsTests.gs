package Oahu.Cli.Tests.Tui.Widgets

import Oahu.Cli.Tui.Widgets
import Oahu.Cli.Tui.Shell
import System
import System.Collections.Generic
import System.Linq
import System.Text
import System.Text.RegularExpressions
import System.IO
import System.IO.Compression
import Xunit

class TerminalGraphicsTests {
    private const KittyReply string = "\u001B_Gi=2147483647;OK\u001B\\"
    private const SixelReply string = "\u001B[?62;4;22c"
    private const CellReply string = "\u001B[6;20;10t"

    @Fact
    func Keystrokes_During_Negotiation_Are_Replayed_As_Input_Events() {
        let reader = AppShell.ConsoleKeyReader()
        let first = ConsoleKeyInfo('2', ConsoleKey.D2, false, false, false)
        let second = ConsoleKeyInfo('j', ConsoleKey.J, false, false, false)
        reader.PushBack(first)
        reader.PushBack(second)
        Assert.Equal(first, reader.ReadEvent()!!.Key)
        Assert.True(reader.TryReadEvent(0, out var ev))
        Assert.Equal(second, ev.Key)
    }

    @Theory
    @InlineData("auto", true, true, true, "Kitty")
    @InlineData("auto", false, true, true, "Sixel")
    @InlineData("auto", false, true, false, "Quadrant")
    @InlineData("auto", false, false, true, "Quadrant")
    @InlineData("sixel", true, true, true, "Sixel")
    @InlineData("kitty", false, true, true, "Quadrant")
    @InlineData("quadrant", true, true, true, "Quadrant")
    func Negotiation_Prefers_Kitty_And_Requires_Measured_Sixel(
        preference string, kitty bool, sixel bool, measured bool, expected string
    ) {
        let graphics = TerminalGraphics()
        graphics.Configure(
            (if kitty { KittyReply } else { string.Empty }) +
            (if sixel { SixelReply } else { string.Empty }) +
            (if measured { CellReply } else { string.Empty }), preference, 100, 40
        )
        Assert.Equal(expected, graphics.Protocol.ToString())
    }

    @Fact
    func Sixel_Can_Measure_Cells_From_Text_Area_And_Rejects_Invalid_Dimensions() {
        let graphics = TerminalGraphics()
        graphics.Configure(SixelReply + "\u001B[4;800;1000t", "auto", 100, 40)
        Assert.Equal(ImageProtocol.Sixel, graphics.Protocol)
        Assert.Equal(10, graphics.CellWidth)
        Assert.Equal(20, graphics.CellHeight)
        graphics.Configure(SixelReply + "\u001B[6;999999999999;10t", "auto", 100, 40)
        Assert.Equal(ImageProtocol.Quadrant, graphics.Protocol)
        graphics.Configure("\u001B[?4;22c" + CellReply, "auto", 100, 40)
        Assert.Equal(ImageProtocol.Quadrant, graphics.Protocol)
    }

    @Fact
    func Kitty_Chunks_Roundtrip_All_RGBA_Bytes_Without_Exceeding_Protocol_Limit() {
        let bytes = [4800]uint8
        Random(42).NextBytes(bytes)
        let pixels = Enumerable.Range(0, 1200).Select((i int32) -> CoverPixel(bytes[i * 4], bytes[i * 4 + 1], bytes[i * 4 + 2], bytes[i * 4 + 3])).ToArray()
        let payload = TerminalImageEncoder.Kitty(TerminalImage(40, 30, pixels), 42)
        let chunks = Regex.Matches(payload, "\u001B_G([^;]+);([A-Za-z0-9+/=]+)\u001B\\\\")
        Assert.True(chunks.Count > 1)
        let data = StringBuilder()
        for var i = 0; i < chunks.Count; i++ {
            Assert.InRange(chunks[i].Groups[2].Length, 1, 4096)
            Assert.Contains(if i + 1 == chunks.Count { "m=0" } else { "m=1" }, chunks[i].Groups[1].Value)
            data.Append(chunks[i].Groups[2].Value)
        }
        Assert.Contains("a=t,f=32,o=z,s=40,v=30,i=42,q=2", payload)
        using let encoded = MemoryStream(Convert.FromBase64String(data.ToString()))
        using let decoder = ZLibStream(encoded, CompressionMode.Decompress)
        using let raw = MemoryStream()
        decoder.CopyTo(raw)
        let decoded = raw.ToArray()
        Assert.Equal(4800, decoded.Length)
        Assert.Equal(bytes, decoded)
        for var i = 0; i < pixels.Length; i++ {
            Assert.Equal(pixels[i].R, decoded[i * 4])
            Assert.Equal(pixels[i].A, decoded[i * 4 + 3])
        }
    }

    @Fact
    func Sixel_Roundtrips_Color_Planes_Runs_And_Partial_Last_Band() {
        let pixels = [35]CoverPixel
        for var y = 0; y < 7; y++ {
            for var x = 0; x < 5; x++ {
                pixels[y * 5 + x] = if y % 2 == 0 { CoverPixel(255, 0, 0, 255) } else { CoverPixel(0, 255, 0, 255) }
            }
        }
        let payload = TerminalImageEncoder.Sixel(TerminalImage(5, 7, pixels), 5, 7, CoverPixel(0, 0, 0, 255))
        Assert.StartsWith("\u001BP0;1;0q\"1;1;5;7", payload)
        Assert.EndsWith("\u001B\\", payload)
        Assert.Contains("!5", payload)
        Assert.Equal(pixels, DecodeSixel(payload, 5, 7))
    }

    @Fact
    func Sixel_Composites_Transparent_Pixels_Onto_The_Pane() {
        let image = TerminalImage(1, 1, []CoverPixel{CoverPixel(0, 0, 255, 0)})
        let payload = TerminalImageEncoder.Sixel(image, 1, 1, CoverPixel(255, 255, 255, 255))
        Assert.Equal([]CoverPixel{CoverPixel(255, 255, 255, 255)}, DecodeSixel(payload, 1, 1))
    }

    @Fact
    func Sixel_Adaptive_Palette_Preserves_Muted_Photographic_Colors() {
        let pixels = []CoverPixel{CoverPixel(72, 94, 117, 255), CoverPixel(170, 160, 150, 255), CoverPixel(90, 120, 140, 255)}
        let result = DecodeSixel(TerminalImageEncoder.Sixel(TerminalImage(3, 1, pixels), 3, 1, default(CoverPixel)), 3, 1)
        for var i = 0; i < pixels.Length; i++ {
            Assert.InRange(Math.Abs(int32(result[i].R) - pixels[i].R), 0, 2)
            Assert.InRange(Math.Abs(int32(result[i].G) - pixels[i].G), 0, 2)
            Assert.InRange(Math.Abs(int32(result[i].B) - pixels[i].B), 0, 2)
        }
    }

    @Fact
    func Sixel_Quantizes_More_Than_256_Colors_With_Bounded_Color_Error() {
        let pixels = [512]CoverPixel
        for var i = 0; i < pixels.Length; i++ {
            pixels[i] = CoverPixel(uint8((i % 16) * 17), uint8(((i / 16) % 16) * 17), uint8((i / 256) * 128), 255)
        }
        let payload = TerminalImageEncoder.Sixel(TerminalImage(32, 16, pixels), 32, 16, default(CoverPixel))
        Assert.InRange(Regex.Matches(payload, "#\\d+;2;").Count, 1, 256)
        let decoded = DecodeSixel(payload, 32, 16)
        for var i = 0; i < pixels.Length; i++ {
            Assert.InRange(Math.Abs(int32(decoded[i].R) - pixels[i].R), 0, 32)
            Assert.InRange(Math.Abs(int32(decoded[i].G) - pixels[i].G), 0, 32)
            Assert.InRange(Math.Abs(int32(decoded[i].B) - pixels[i].B), 0, 32)
            Assert.Equal(uint8(255), decoded[i].A)
        }
    }

    @Fact
    func Sixel_Fits_The_Reserved_Rectangle_Without_Stretching_The_Image() {
        let graphics = TerminalGraphics()
        graphics.Configure(SixelReply + CellReply, "sixel", 100, 40)
        let image = TerminalImage(1, 1, []CoverPixel{CoverPixel(255, 0, 0, 255)})
        let frame = TerminalGraphics.Marker(0, 3) + "\n" + TerminalGraphics.Marker(1, 3)
        let painted = graphics.Paint(frame, ImagePlacement(image, 3, 2, default(CoverPixel)))
        Assert.Contains("\"1;1;30;30", painted)
        Assert.DoesNotContain("\"1;1;30;40", painted)
        Assert.Contains("\u001B[?80r", painted)
    }

    @Fact
    func Placement_Uses_Visible_Columns_And_Suppresses_Partially_Overlaid_Images() {
        let frame = "\u001B[31m界\u001B[0m${TerminalGraphics.Marker(0, 4)}\n  ${TerminalGraphics.Marker(1, 4)}"
        let full = TerminalGraphics.Resolve(frame, 4, 2)
        Assert.True(full.Visible)
        Assert.Equal(2, full.X)
        Assert.Equal(0, full.Y)
        Assert.DoesNotContain(char(0xe000).ToString(), full.Frame)
        let partial = TerminalGraphics.Resolve(frame.Replace(String(char(0xe001), 4), "XX" + String(char(0xe001), 2)), 4, 2)
        Assert.False(partial.Visible)
        Assert.DoesNotContain(char(0xe001).ToString(), partial.Frame)
    }

    @Fact
    func Kitty_Reuses_Uploads_On_Selection_Redraw_And_Deletes_When_Leaving_The_Screen() {
        let graphics = TerminalGraphics()
        graphics.Configure(KittyReply, "auto", 100, 40)
        let placement = ImagePlacement(TerminalImage(1, 1, []CoverPixel{CoverPixel(255, 0, 0, 255)}), 4, 1, default(CoverPixel))
        let frame = "\u001B[H0 selected\n" + TerminalGraphics.Marker(0, 4) + "\u001B[K\u001B[J"
        let first = graphics.Paint(frame, placement)
        Assert.Contains("a=t,", first)
        Assert.Contains("a=p,", first)
        Assert.Contains("r=1,C=1", first)
        Assert.DoesNotContain("c=4,r=1", first)
        let second = graphics.Paint(frame.Replace("0 selected", "1 selected"), placement)
        Assert.DoesNotContain("a=t,", second)
        Assert.DoesNotContain("a=d,", second)
        Assert.Contains("a=p,", second)
        let deselected = graphics.Paint(frame, placement)
        Assert.DoesNotContain("a=t,", deselected)
        Assert.DoesNotContain("a=d,", deselected)
        Assert.Contains("a=p,", deselected)
        Assert.Contains("d=I,", graphics.Paint("home", nil))
        Assert.Equal(string.Empty, graphics.Delete())
    }

    @Fact
    func Kitty_Replaces_Selection_And_Resizes_With_One_Aspect_Ratio_Constraint() {
        let graphics = TerminalGraphics()
        graphics.Configure(KittyReply + CellReply, "auto", 100, 40)
        let red = TerminalImage(1, 1, []CoverPixel{CoverPixel(255, 0, 0, 255)})
        let blue = TerminalImage(1, 1, []CoverPixel{CoverPixel(0, 0, 255, 255)})
        let firstFrame = TerminalGraphics.Marker(0, 4) + "\n" + TerminalGraphics.Marker(1, 4)
        graphics.Paint(firstFrame, ImagePlacement(red, 4, 2, default(CoverPixel)))
        let replacement = graphics.Paint(firstFrame, ImagePlacement(blue, 4, 2, default(CoverPixel)))
        Assert.True(replacement.IndexOf("d=I,", StringComparison.Ordinal) < replacement.IndexOf("a=t,", StringComparison.Ordinal))
        Assert.Contains("c=4,C=1", replacement)
        let resized = graphics.Paint(TerminalGraphics.Marker(0, 4), ImagePlacement(blue, 4, 1, default(CoverPixel)))
        Assert.DoesNotContain("a=t,", resized)
        Assert.DoesNotContain("a=d,", resized)
        Assert.Contains("r=1,C=1", resized)
        let hidden = graphics.Paint("dialog", ImagePlacement(blue, 4, 1, default(CoverPixel)))
        Assert.Contains("d=I,", hidden)
        Assert.DoesNotContain("a=p,", hidden)
        let restored = graphics.Paint(firstFrame, ImagePlacement(blue, 4, 2, default(CoverPixel)))
        Assert.Contains("a=t,", restored)
        Assert.Contains("a=p,", restored)
    }

    @Fact
    func Sixel_Invalidates_Cached_Raster_When_The_Pane_Background_Changes() {
        let graphics = TerminalGraphics()
        graphics.Configure(SixelReply + CellReply, "sixel", 100, 40)
        let image = TerminalImage(1, 1, []CoverPixel{CoverPixel(255, 0, 0, 0)})
        let frame = TerminalGraphics.Marker(0, 1)
        let white = graphics.Paint(frame, ImagePlacement(image, 1, 1, CoverPixel(255, 255, 255, 255)))
        let black = graphics.Paint(frame, ImagePlacement(image, 1, 1, CoverPixel(0, 0, 0, 255)))
        Assert.Contains("#0;2;100;100;100", white)
        Assert.Contains("#0;2;0;0;0", black)
        Assert.DoesNotContain("#0;2;100;100;100", black)
    }

    shared {
        // Independent decoding checks the produced raster, not just escape strings.
        private func DecodeSixel(payload string, width int32, height int32)[]CoverPixel {
            let colors = Dictionary[int32, CoverPixel]()
            let pixels = [width * height]CoverPixel
            let start = payload.IndexOf('q') + 1
            let body = payload.Substring(start, payload.Length - start - 2)
            let tokens = Regex.Matches(body, "\"[0-9;]+|#\\d+(?:;2;\\d+;\\d+;\\d+)?|!\\d+[?-~]|[?-~]|\\$|-")
            var color = 0
            var x = 0
            var y = 0
            for token Match in tokens {
                let value = token.Value
                if value[0] == '"' { continue }
                if value[0] == '#' {
                    let parts = value.Substring(1).Split(';')
                    color = int32.Parse(parts[0])
                    if parts.Length > 1 {
                        colors[color] = CoverPixel(
                            uint8((int32.Parse(parts[2]) * 255 + 50) / 100),
                            uint8((int32.Parse(parts[3]) * 255 + 50) / 100),
                            uint8((int32.Parse(parts[4]) * 255 + 50) / 100), 255
                        )
                    }
                    continue
                }
                if value == "$" {
                    x = 0
                    continue
                }
                if value == "-" {
                    x = 0
                    y += 6
                    continue
                }
                let count = if value[0] == '!' { int32.Parse(value.Substring(1, value.Length - 2)) } else { 1 }
                let mask = int32(value[value.Length - 1]) - 63
                for var repeat = 0; repeat < count; repeat++ {
                    for var dy = 0; dy < 6 && y + dy < height; dy++ {
                        if (mask & (1 << dy)) != 0 { pixels[(y + dy) * width + x] = colors[color] }
                    }
                    x++
                }
            }
            return pixels
        }
    }
}
