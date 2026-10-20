using System;
using System.IO;
using Oahu.Cli.Tui.Widgets;
using Spectre.Console;
using Xunit;

namespace Oahu.Cli.Tests.Tui.Widgets;

public class CoverArtTests
{
    // Synthetic 2x2 red/green/blue/white images; JPEG fixtures are solid blue.
    private const string Png = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DA8J+BkYHh////DAAe9gT9Ce00PgAAAABJRU5ErkJggg==";
    private const string Gif = "R0lGODdhAgACAIEAAP///wD/AP8AAAAA/ywAAAAAAgACAAAIBwAFBBgAICAAOw==";
    private const string Bmp = "Qk1GAAAAAAAAADYAAAAoAAAAAgAAAAIAAAABABgAAAAAABAAAADEDgAAxA4AAAAAAAAAAAAA/wAA////AAAAAP8A/wAAAA==";
    private const string Tiff = "SUkqAAgAAAAKAAABBAABAAAAAgAAAAEBBAABAAAAAgAAAAIBAwADAAAAhgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAjAAAABUBAwABAAAAAwAAABYBBAABAAAAAgAAABcBBAABAAAADAAAABwBAwABAAAAAQAAAAAAAAAIAAgACAD/AAAA/wAAAP////8=";
    private const string BigEndianTiff = "TU0AKgAAAAgACgEAAAQAAAABAAAAAgEBAAQAAAABAAAAAgECAAMAAAADAAAAhgEDAAMAAAABAAEAAAEGAAMAAAABAAIAAAERAAQAAAABAAAAjAEVAAMAAAABAAMAAAEWAAQAAAABAAAAAgEXAAQAAAABAAAADAEcAAMAAAABAAEAAAAAAAAACAAIAAj/AAAA/wAAAP////8=";
    private const string Jpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAACP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIbAMga3/9k=";
    private const string ProgressiveJpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAH/9oADAMBAAIQAxAAAAGGhkNf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAD/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";

    [Theory]
    [InlineData("png")]
    [InlineData("gif")]
    [InlineData("bmp")]
    [InlineData("tiff")]
    [InlineData("tiff-be")]
    public void Decodes_Cached_Formats_In_Top_Down_RGB_Order(string format)
    {
        var encoded = format switch
        {
            "png" => Png,
            "gif" => Gif,
            "bmp" => Bmp,
            "tiff" => Tiff,
            _ => BigEndianTiff,
        };
        using var file = new ImageFile(encoded);
        var image = CoverImage.Load(file.Path);
        Assert.Equal(2, image.Width);
        Assert.Equal(2, image.Height);
        Assert.Equal(
            new[] { new CoverPixel(255, 0, 0, 255), new CoverPixel(0, 255, 0, 255), new CoverPixel(0, 0, 255, 255), new CoverPixel(255, 255, 255, 255) },
            image.Pixels);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Decodes_Baseline_And_Progressive_Jpeg(bool progressive)
    {
        using var file = new ImageFile(progressive ? ProgressiveJpeg : Jpeg);
        var image = CoverImage.Load(file.Path);
        Assert.Equal(2, image.Width);
        Assert.Equal(2, image.Height);
        foreach (var pixel in image.Pixels)
        {
            Assert.InRange((int)pixel.R, 18, 22);
            Assert.InRange((int)pixel.G, 78, 82);
            Assert.InRange((int)pixel.B, 158, 162);
            Assert.Equal((byte)255, pixel.A);
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Png_And_Tiff_Alpha_Are_Resampled_Without_Dark_Fringes(bool tiff)
    {
        var encoded = tiff
            ? "SUkqAAgAAAALAAABBAABAAAAAgAAAAEBBAABAAAAAQAAAAIBAwAEAAAAkgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAmgAAABUBAwABAAAABAAAABYBBAABAAAAAQAAABcBBAABAAAACAAAABwBAwABAAAAAQAAAFIBAwABAAAAAgAAAAAAAAAIAAgACAAIAP8AAIAAAP8A"
            : "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DQwMDwnwEADH8Cf4i6MZwAAAAASUVORK5CYII=";
        using var file = new ImageFile(encoded);
        var image = CoverImage.Load(file.Path);
        Assert.Equal((byte)128, image.Pixels[0].A);
        Assert.Equal((byte)0, image.Pixels[1].A);
        Assert.Equal(new[] { new CoverPixel(255, 0, 0, 64) }, CoverImage.Resize(image.Pixels, image.Width, image.Height, 1, 1));
    }

    [Fact]
    public void Downsampling_Averages_The_Entire_Source_Area()
    {
        var pixels = new[]
        {
            new CoverPixel(255, 0, 0, 255), new CoverPixel(0, 255, 0, 255),
            new CoverPixel(0, 0, 255, 255), new CoverPixel(255, 255, 255, 255),
        };
        var result = CoverImage.Resize(pixels, 2, 2, 1, 1);
        Assert.Equal(new[] { new CoverPixel(128, 128, 128, 255) }, result);
    }

    [Fact]
    public void Upsampling_Interpolates_And_Clamps_Both_Edges()
    {
        var result = CoverImage.Resize(new[] { new CoverPixel(0, 0, 0, 255), new CoverPixel(200, 100, 40, 255) }, 2, 1, 4, 2);
        var row = new[]
        {
            new CoverPixel(0, 0, 0, 255), new CoverPixel(50, 25, 10, 255),
            new CoverPixel(150, 75, 30, 255), new CoverPixel(200, 100, 40, 255),
        };
        Assert.Equal(new[] { row[0], row[1], row[2], row[3], row[0], row[1], row[2], row[3] }, result);
    }

    [Fact]
    public void Resampling_Does_Not_Bleed_Transparent_RGB_Into_Visible_Pixels()
    {
        var pixels = new[] { new CoverPixel(255, 0, 0, 255), new CoverPixel(0, 0, 255, 0) };
        Assert.Equal(new[] { new CoverPixel(255, 0, 0, 128) }, CoverImage.Resize(pixels, 2, 1, 1, 1));
        Assert.Equal(new[] { new CoverPixel(0, 0, 0, 0) }, CoverImage.Resize(new[] { pixels[1] }, 1, 1, 1, 1));
    }

    [Fact]
    public void Mixed_Axis_Resize_Handles_Odd_Sizes_And_Single_Pixel_Axes()
    {
        var pixels = new[] { new CoverPixel(0, 0, 0, 255), new CoverPixel(90, 90, 90, 255), new CoverPixel(180, 180, 180, 255) };
        var result = CoverImage.Resize(pixels, 3, 1, 2, 3);
        Assert.Equal(
            new[]
            {
                new CoverPixel(30, 30, 30, 255), new CoverPixel(150, 150, 150, 255),
                new CoverPixel(30, 30, 30, 255), new CoverPixel(150, 150, 150, 255),
                new CoverPixel(30, 30, 30, 255), new CoverPixel(150, 150, 150, 255),
            },
            result);
    }

    [Fact]
    public void Invalid_Dimensions_And_Mismatched_Buffers_Are_Rejected()
    {
        var pixels = new[] { new CoverPixel(0, 0, 0, 255) };
        Assert.Throws<InvalidDataException>(() => CoverImage.Resize(pixels, 0, 1, 1, 1));
        Assert.Throws<InvalidDataException>(() => CoverImage.Resize(pixels, int.MaxValue, int.MaxValue, 1, 1));
        Assert.Throws<InvalidDataException>(() => CoverImage.Resize(pixels, 1, 1, -1, 1));
        Assert.Throws<ArgumentException>(() => CoverImage.Resize(pixels, 2, 1, 1, 1));
    }

    [Fact]
    public void Malformed_And_Oversized_Files_Are_Rejected_Before_Decoding()
    {
        using var file = new ImageFile(Convert.ToBase64String(new byte[] { 0, 0, 0, 0 }));
        Assert.Throws<InvalidDataException>(() => CoverImage.Load(file.Path));
        using (var stream = File.OpenWrite(file.Path))
        {
            stream.SetLength((32 * 1024 * 1024) + 1);
        }
        Assert.Throws<InvalidDataException>(() => CoverImage.Load(file.Path));
    }

    [Fact]
    public void Oversized_Bitmap_Dimensions_Are_Rejected_Before_Allocating_Pixels()
    {
        using var file = new ImageFile(Bmp);
        var bytes = File.ReadAllBytes(file.Path);
        BitConverter.GetBytes(int.MaxValue).CopyTo(bytes, 18);
        File.WriteAllBytes(file.Path, bytes);
        Assert.Throws<InvalidDataException>(() => CoverImage.Load(file.Path));
    }

    [Theory]
    [InlineData(6)]
    [InlineData(7)]
    [InlineData(60)]
    public void Rendering_Preserves_Cell_Count_And_Quadrant_Color_Markup(int width)
    {
        using var file = new ImageFile(Png);
        var result = CoverArt.Decode(file.Path, width);
        Assert.Equal(CoverArt.CoverState.Ready, result.State);
        Assert.NotNull(result.Lines);
        Assert.Equal((width + 1) / 2, result.Lines.Count);
        foreach (var line in result.Lines)
        {
            Assert.Equal(width, Markup.Remove(line).Length);
            Assert.Contains(" on #", line);
            Assert.DoesNotContain("\u001b", line, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Exact_Quadrant_Colors_And_Glyph_Are_Unchanged_Without_Resizing()
    {
        using var file = new ImageFile(Png);
        var result = CoverArt.Decode(file.Path, 1);
        Assert.Equal("[#7fff7f on #7f007f]▐[/]", result.Lines![0]);
    }

    private sealed class ImageFile : IDisposable
    {
        public ImageFile(string encoded)
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"oahu-cover-{Guid.NewGuid():N}.img");
            File.WriteAllBytes(Path, Convert.FromBase64String(encoded));
        }

        public string Path { get; }

        public void Dispose() => File.Delete(Path);
    }
}
