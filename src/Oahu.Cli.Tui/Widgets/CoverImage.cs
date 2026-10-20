using System;
using System.IO;
using BitMiracle.LibTiff.Classic;
using StbImageSharp;

namespace Oahu.Cli.Tui.Widgets;

internal readonly record struct CoverPixel(byte R, byte G, byte B, byte A);

/// <summary>Image codecs stop at RGBA pixels; terminal-sized resampling belongs to Oahu.</summary>
internal static class CoverImage
{
    private const int MaxPixels = 16 * 1024 * 1024;
    private const int MaxFileBytes = 32 * 1024 * 1024;

    internal static (int Width, int Height, CoverPixel[] Pixels) Load(string path)
    {
        using var stream = File.OpenRead(path);
        if (stream.Length > MaxFileBytes)
        {
            throw new InvalidDataException("Cover image exceeds the 32 MiB file limit.");
        }

        var header = new byte[4];
        stream.ReadExactly(header);
        stream.Position = 0;
        if ((header[0] == 0x49 && header[1] == 0x49 && header[2] == 42 && header[3] == 0) ||
            (header[0] == 0x4d && header[1] == 0x4d && header[2] == 0 && header[3] == 42))
        {
            return LoadTiff(stream);
        }

        var info = ImageInfo.FromStream(stream)
            ?? throw new InvalidDataException("Unsupported or invalid cover image.");
        var width = info.Width;
        var height = info.Height;
        ValidateDimensions(width, height);
        stream.Position = 0;
        var image = ImageResult.FromStream(stream, ColorComponents.RedGreenBlueAlpha)
            ?? throw new InvalidDataException("Cannot decode cover image.");
        var data = image.Data;
        if (image.Width != width || image.Height != height || data == null || data.Length != width * height * 4)
        {
            throw new InvalidDataException("Cover image dimensions do not match its pixel data.");
        }

        var pixels = new CoverPixel[width * height];
        for (var i = 0; i < pixels.Length; i++)
        {
            var offset = i * 4;
            pixels[i] = new CoverPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
        }
        return (width, height, pixels);
    }

    /// <summary>
    /// Area sampling prevents fine cover details aliasing at terminal resolution.
    /// Upscaling uses bilinear samples at pixel centers, clamped at the edges.
    /// </summary>
    internal static CoverPixel[] Resize(CoverPixel[] pixels, int width, int height, int targetWidth, int targetHeight)
    {
        ArgumentNullException.ThrowIfNull(pixels);
        ValidateDimensions(width, height);
        ValidateDimensions(targetWidth, targetHeight);
        if (pixels.Length != width * height)
        {
            throw new ArgumentException("Pixel buffer does not match image dimensions.", nameof(pixels));
        }

        var result = new CoverPixel[targetWidth * targetHeight];
        var scaleX = (double)width / targetWidth;
        var scaleY = (double)height / targetHeight;
        for (var y = 0; y < targetHeight; y++)
        {
            var top = scaleY >= 1d ? y * scaleY : ((y + 0.5d) * scaleY) - 0.5d;
            var bottom = scaleY >= 1d ? (y + 1) * scaleY : top + 2d;
            for (var x = 0; x < targetWidth; x++)
            {
                var left = scaleX >= 1d ? x * scaleX : ((x + 0.5d) * scaleX) - 0.5d;
                var right = scaleX >= 1d ? (x + 1) * scaleX : left + 2d;
                var red = 0d;
                var green = 0d;
                var blue = 0d;
                var alpha = 0d;
                var total = 0d;
                for (var sy = (int)Math.Floor(top); sy < (int)Math.Ceiling(bottom); sy++)
                {
                    var wy = Weight(sy, top, bottom, scaleY);
                    for (var sx = (int)Math.Floor(left); sx < (int)Math.Ceiling(right); sx++)
                    {
                        var weight = wy * Weight(sx, left, right, scaleX);
                        var pixel = pixels[(Math.Clamp(sy, 0, height - 1) * width) + Math.Clamp(sx, 0, width - 1)];
                        var a = pixel.A * weight;
                        red += pixel.R * a;
                        green += pixel.G * a;
                        blue += pixel.B * a;
                        alpha += a;
                        total += weight;
                    }
                }
                result[(y * targetWidth) + x] = alpha > 0d
                    ? new CoverPixel(ToByte(red / alpha), ToByte(green / alpha), ToByte(blue / alpha), ToByte(alpha / total))
                    : new CoverPixel(0, 0, 0, 0);
            }
        }
        return result;
    }

    private static (int Width, int Height, CoverPixel[] Pixels) LoadTiff(Stream stream)
    {
        using var image = Tiff.ClientOpen("cover", "r", stream, new TiffStream())
            ?? throw new InvalidDataException("Invalid TIFF cover image.");
        var widthField = image.GetField(TiffTag.IMAGEWIDTH);
        var heightField = image.GetField(TiffTag.IMAGELENGTH);
        if (widthField == null || heightField == null)
        {
            throw new InvalidDataException("TIFF cover image has no dimensions.");
        }

        var width = widthField[0].ToInt();
        var height = heightField[0].ToInt();
        ValidateDimensions(width, height);
        var raster = new int[width * height];
        if (!image.ReadRGBAImageOriented(width, height, raster, Orientation.TOPLEFT, true))
        {
            throw new InvalidDataException("Cannot decode TIFF cover image.");
        }

        var pixels = new CoverPixel[raster.Length];
        for (var i = 0; i < raster.Length; i++)
        {
            var value = raster[i];
            var alpha = Tiff.GetA(value);
            // LibTiff returns associated alpha; the resampler expects straight RGBA.
            pixels[i] = new CoverPixel(
                Unpremultiply(Tiff.GetR(value), alpha),
                Unpremultiply(Tiff.GetG(value), alpha),
                Unpremultiply(Tiff.GetB(value), alpha),
                (byte)alpha);
        }
        return (width, height, pixels);
    }

    private static byte Unpremultiply(int value, int alpha) =>
        alpha == 0 ? (byte)0 : (byte)Math.Min(255, ((value * 255) + (alpha / 2)) / alpha);

    private static void ValidateDimensions(int width, int height)
    {
        if (width <= 0 || height <= 0 || (long)width * height > MaxPixels)
        {
            throw new InvalidDataException("Cover image dimensions exceed the 16 megapixel limit.");
        }
    }

    private static double Weight(int pixel, double start, double end, double scale) =>
        scale >= 1d
            ? Math.Max(0d, Math.Min(end, pixel + 1d) - Math.Max(start, pixel))
            : Math.Max(0d, 1d - Math.Abs(pixel - start));

    private static byte ToByte(double value) => (byte)Math.Clamp(Math.Round(value), 0d, 255d);
}
