package Oahu.Cli.Tests.Tui.Widgets

import Oahu.Cli.Tui.Widgets
import Spectre.Console
import System
import System.IO
import Xunit

class CoverArtTests {
    // Synthetic 2x2 red/green/blue/white images; JPEG fixtures are solid blue.
    private const Png string = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DA8J+BkYHh////DAAe9gT9Ce00PgAAAABJRU5ErkJggg=="
    private const Gif string = "R0lGODdhAgACAIEAAP///wD/AP8AAAAA/ywAAAAAAgACAAAIBwAFBBgAICAAOw=="
    private const Bmp string = "Qk1GAAAAAAAAADYAAAAoAAAAAgAAAAIAAAABABgAAAAAABAAAADEDgAAxA4AAAAAAAAAAAAA/wAA////AAAAAP8A/wAAAA=="
    private const Tiff string = "SUkqAAgAAAAKAAABBAABAAAAAgAAAAEBBAABAAAAAgAAAAIBAwADAAAAhgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAjAAAABUBAwABAAAAAwAAABYBBAABAAAAAgAAABcBBAABAAAADAAAABwBAwABAAAAAQAAAAAAAAAIAAgACAD/AAAA/wAAAP////8="
    private const BigEndianTiff string = "TU0AKgAAAAgACgEAAAQAAAABAAAAAgEBAAQAAAABAAAAAgECAAMAAAADAAAAhgEDAAMAAAABAAEAAAEGAAMAAAABAAIAAAERAAQAAAABAAAAjAEVAAMAAAABAAMAAAEWAAQAAAABAAAAAgEXAAQAAAABAAAADAEcAAMAAAABAAEAAAAAAAAACAAIAAj/AAAA/wAAAP////8="
    private const Jpeg string = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAACP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIbAMga3/9k="
    private const ProgressiveJpeg string = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAH/9oADAMBAAIQAxAAAAGGhkNf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAD/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k="

    @Theory
    @InlineData("png")
    @InlineData("gif")
    @InlineData("bmp")
    @InlineData("tiff")
    @InlineData("tiff-be")
    func Decodes_Cached_Formats_In_Top_Down_RGB_Order(format string) {
        let encoded = switch format {
            case "png": Png
            case "gif": Gif
            case "bmp": Bmp
            case "tiff": Tiff
            default: BigEndianTiff
        }
        using let file = ImageFile(encoded)
        let image = CoverImage.Load(file.Path)
        Assert.Equal(2, image.Width)
        Assert.Equal(2, image.Height)
        Assert.Equal(
            []CoverPixel{CoverPixel(255, 0, 0, 255), CoverPixel(0, 255, 0, 255), CoverPixel(0, 0, 255, 255), CoverPixel(255, 255, 255, 255)},
            image.Pixels
        )
    }

    @Theory
    @InlineData(false)
    @InlineData(true)
    func Decodes_Baseline_And_Progressive_Jpeg(progressive bool) {
        using let file = ImageFile(if progressive { ProgressiveJpeg } else { Jpeg })
        let image = CoverImage.Load(file.Path)
        Assert.Equal(2, image.Width)
        Assert.Equal(2, image.Height)
        for p in image.Pixels {
            Assert.InRange(int32(p.R), 18, 22)
            Assert.InRange(int32(p.G), 78, 82)
            Assert.InRange(int32(p.B), 158, 162)
            Assert.Equal(uint8(255), p.A)
        }
    }

    @Theory
    @InlineData(false)
    @InlineData(true)
    func Png_And_Tiff_Alpha_Are_Resampled_Without_Dark_Fringes(tiff bool) {
        let encoded = if tiff {
            "SUkqAAgAAAALAAABBAABAAAAAgAAAAEBBAABAAAAAQAAAAIBAwAEAAAAkgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAmgAAABUBAwABAAAABAAAABYBBAABAAAAAQAAABcBBAABAAAACAAAABwBAwABAAAAAQAAAFIBAwABAAAAAgAAAAAAAAAIAAgACAAIAP8AAIAAAP8A"
        } else {
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DQwMDwnwEADH8Cf4i6MZwAAAAASUVORK5CYII="
        }
        using let file = ImageFile(encoded)
        let image = CoverImage.Load(file.Path)
        Assert.Equal(uint8(128), image.Pixels[0].A)
        Assert.Equal(uint8(0), image.Pixels[1].A)
        Assert.Equal([]CoverPixel{CoverPixel(255, 0, 0, 64)}, CoverImage.Resize(image.Pixels, image.Width, image.Height, 1, 1))
    }

    @Fact
    func Downsampling_Averages_The_Entire_Source_Area() {
        let pixels = []CoverPixel{
            CoverPixel(255, 0, 0, 255), CoverPixel(0, 255, 0, 255),
            CoverPixel(0, 0, 255, 255), CoverPixel(255, 255, 255, 255)
        }
        let result = CoverImage.Resize(pixels, 2, 2, 1, 1)
        Assert.Equal([]CoverPixel{CoverPixel(128, 128, 128, 255)}, result)
    }

    @Fact
    func Upsampling_Interpolates_And_Clamps_Both_Edges() {
        let result = CoverImage.Resize([]CoverPixel{CoverPixel(0, 0, 0, 255), CoverPixel(200, 100, 40, 255)}, 2, 1, 4, 2)
        let row = []CoverPixel{
            CoverPixel(0, 0, 0, 255), CoverPixel(50, 25, 10, 255),
            CoverPixel(150, 75, 30, 255), CoverPixel(200, 100, 40, 255)
        }
        Assert.Equal([]CoverPixel{row[0], row[1], row[2], row[3], row[0], row[1], row[2], row[3]}, result)
    }

    @Fact
    func Resampling_Does_Not_Bleed_Transparent_RGB_Into_Visible_Pixels() {
        let pixels = []CoverPixel{CoverPixel(255, 0, 0, 255), CoverPixel(0, 0, 255, 0)}
        Assert.Equal([]CoverPixel{CoverPixel(255, 0, 0, 128)}, CoverImage.Resize(pixels, 2, 1, 1, 1))
        Assert.Equal([]CoverPixel{CoverPixel(0, 0, 0, 0)}, CoverImage.Resize([]CoverPixel{pixels[1]}, 1, 1, 1, 1))
    }

    @Fact
    func Mixed_Axis_Resize_Handles_Odd_Sizes_And_Single_Pixel_Axes() {
        let pixels = []CoverPixel{CoverPixel(0, 0, 0, 255), CoverPixel(90, 90, 90, 255), CoverPixel(180, 180, 180, 255)}
        let result = CoverImage.Resize(pixels, 3, 1, 2, 3)
        Assert.Equal(
            []CoverPixel{
                CoverPixel(30, 30, 30, 255), CoverPixel(150, 150, 150, 255),
                CoverPixel(30, 30, 30, 255), CoverPixel(150, 150, 150, 255),
                CoverPixel(30, 30, 30, 255), CoverPixel(150, 150, 150, 255)
            },
            result
        )
    }

    @Fact
    func Invalid_Dimensions_And_Mismatched_Buffers_Are_Rejected() {
        let pixels = []CoverPixel{CoverPixel(0, 0, 0, 255)}
        Assert.Throws[InvalidDataException](() -> CoverImage.Resize(pixels, 0, 1, 1, 1))
        Assert.Throws[InvalidDataException](() -> CoverImage.Resize(pixels, int32.MaxValue, int32.MaxValue, 1, 1))
        Assert.Throws[InvalidDataException](() -> CoverImage.Resize(pixels, 1, 1, -1, 1))
        Assert.Throws[ArgumentException](() -> CoverImage.Resize(pixels, 2, 1, 1, 1))
    }

    @Fact
    func Malformed_And_Oversized_Files_Are_Rejected_Before_Decoding() {
        using let file = ImageFile(Convert.ToBase64String([]uint8{0, 0, 0, 0}))
        Assert.Throws[InvalidDataException](() -> CoverImage.Load(file.Path))
        using let stream = File.OpenWrite(file.Path)
        stream.SetLength(32 * 1024 * 1024 + 1)
        stream.Dispose()
        Assert.Throws[InvalidDataException](() -> CoverImage.Load(file.Path))
    }

    @Fact
    func Oversized_Bitmap_Dimensions_Are_Rejected_Before_Allocating_Pixels() {
        using let file = ImageFile(Bmp)
        let bytes = File.ReadAllBytes(file.Path)
        BitConverter.GetBytes(int32.MaxValue).CopyTo(bytes, 18)
        File.WriteAllBytes(file.Path, bytes)
        Assert.Throws[InvalidDataException](() -> CoverImage.Load(file.Path))
    }

    @Theory
    @InlineData(6)
    @InlineData(7)
    @InlineData(60)
    func Rendering_Preserves_Cell_Count_And_Quadrant_Color_Markup(width int32) {
        using let file = ImageFile(Png)
        let result = CoverArt.Decode(file.Path, width)
        Assert.Equal(CoverArt.CoverState.Ready, result.State)
        Assert.NotNull(result.Lines)
        Assert.Equal((width + 1) / 2, result.Lines!!.Count)
        for line in result.Lines!! {
            Assert.Equal(width, Markup.Remove(line).Length)
            Assert.Contains(" on #", line)
            Assert.DoesNotContain("\u001b", line, StringComparison.Ordinal)
        }
    }

    @Fact
    func Exact_Quadrant_Colors_And_Glyph_Are_Unchanged_Without_Resizing() {
        using let file = ImageFile(Png)
        let result = CoverArt.Decode(file.Path, 1)
        Assert.Equal("[#7fff7f on #7f007f]▐[/]", result.Lines!![0])
    }

    private class ImageFile : IDisposable {
        private let tempPath string

        init(encoded string) {
            tempPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "oahu-cover-${Guid.NewGuid():N}.img")
            File.WriteAllBytes(Path, Convert.FromBase64String(encoded))
        }

        prop Path string -> tempPath

        func Dispose() -> File.Delete(Path)
    }
}
