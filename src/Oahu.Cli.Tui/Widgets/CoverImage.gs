package Oahu.Cli.Tui.Widgets

import BitMiracle.LibTiff.Classic
import StbImageSharp
import System
import System.IO

internal data struct CoverPixel(R uint8, G uint8, B uint8, A uint8)

/// Image codecs stop at RGBA pixels; terminal-sized resampling belongs to Oahu.
internal class CoverImage {
    shared {
        private const MaxPixels int32 = 16 * 1024 * 1024
        private const MaxFileBytes int32 = 32 * 1024 * 1024

        func Load(path string) (Width int32, Height int32, Pixels[]CoverPixel) {
            using let stream = File.OpenRead(path)
            if stream.Length > MaxFileBytes {
                throw InvalidDataException("Cover image exceeds the 32 MiB file limit.")
            }
            let header = [4]uint8
            stream.ReadExactly(header)
            stream.Position = 0
            if (header[0] == 0x49 && header[1] == 0x49 && header[2] == 42 && header[3] == 0) ||
                (header[0] == 0x4d && header[1] == 0x4d && header[2] == 0 && header[3] == 42) {
                return LoadTiff(stream)
            }
            let info = ImageInfo.FromStream(stream)
            if info == nil {
                throw InvalidDataException("Unsupported or invalid cover image.")
            }
            let width = info.Width
            let height = info.Height
            ValidateDimensions(width, height)
            stream.Position = 0
            let image = ImageResult.FromStream(stream, ColorComponents.RedGreenBlueAlpha)
            if image == nil {
                throw InvalidDataException("Cannot decode cover image.")
            }
            let data = image.Data
            if image.Width != width || image.Height != height || data == nil || data.Length != width * height * 4 {
                throw InvalidDataException("Cover image dimensions do not match its pixel data.")
            }
            let pixels = [width * height]CoverPixel
            for var i = 0; i < pixels.Length; i++ {
                let offset = i * 4
                pixels[i] = CoverPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])
            }
            return (width, height, pixels)
        }

        private func LoadTiff(stream Stream) (Width int32, Height int32, Pixels[]CoverPixel) {
            using let image = Tiff.ClientOpen("cover", "r", stream, TiffStream())
            if image == nil {
                throw InvalidDataException("Invalid TIFF cover image.")
            }
            let widthField = image.GetField(TiffTag.IMAGEWIDTH)
            let heightField = image.GetField(TiffTag.IMAGELENGTH)
            if widthField == nil || heightField == nil {
                throw InvalidDataException("TIFF cover image has no dimensions.")
            }
            let width = widthField[0].ToInt()
            let height = heightField[0].ToInt()
            ValidateDimensions(width, height)
            let raster = [width * height]int32
            if !image.ReadRGBAImageOriented(width, height, raster, Orientation.TOPLEFT, true) {
                throw InvalidDataException("Cannot decode TIFF cover image.")
            }
            let pixels = [raster.Length]CoverPixel
            for var i = 0; i < raster.Length; i++ {
                let value = raster[i]
                let alpha = Tiff.GetA(value)
                // LibTiff returns associated alpha; the resampler expects straight RGBA.
                pixels[i] = CoverPixel(
                    Unpremultiply(Tiff.GetR(value), alpha),
                    Unpremultiply(Tiff.GetG(value), alpha),
                    Unpremultiply(Tiff.GetB(value), alpha),
                    uint8(alpha)
                )
            }
            return (width, height, pixels)
        }

        private func Unpremultiply(value int32, alpha int32) uint8 ->
            if alpha == 0 { uint8(0) } else { uint8(Math.Min(255, (value * 255 + alpha / 2) / alpha)) }

        private func ValidateDimensions(width int32, height int32) {
            if width <= 0 || height <= 0 || int64(width) * int64(height) > MaxPixels {
                throw InvalidDataException("Cover image dimensions exceed the 16 megapixel limit.")
            }
        }

        /// Area sampling prevents fine cover details aliasing at terminal resolution.
        /// Upscaling uses bilinear samples at pixel centers, clamped at the edges.
        func Resize(pixels[]CoverPixel, width int32, height int32, targetWidth int32, targetHeight int32)[]CoverPixel {
            ArgumentNullException.ThrowIfNull(pixels)
            ValidateDimensions(width, height)
            ValidateDimensions(targetWidth, targetHeight)
            if pixels.Length != width * height {
                throw ArgumentException("Pixel buffer does not match image dimensions.", nameof(pixels))
            }
            let result = [targetWidth * targetHeight]CoverPixel
            let scaleX = float64(width) / float64(targetWidth)
            let scaleY = float64(height) / float64(targetHeight)
            for var y = 0; y < targetHeight; y++ {
                let top = if scaleY >= 1.0d { float64(y) * scaleY } else { (float64(y) + 0.5d) * scaleY - 0.5d }
                let bottom = if scaleY >= 1.0d { float64(y + 1) * scaleY } else { top + 2.0d }
                for var x = 0; x < targetWidth; x++ {
                    let left = if scaleX >= 1.0d { float64(x) * scaleX } else { (float64(x) + 0.5d) * scaleX - 0.5d }
                    let right = if scaleX >= 1.0d { float64(x + 1) * scaleX } else { left + 2.0d }
                    var red = 0.0d
                    var green = 0.0d
                    var blue = 0.0d
                    var alpha = 0.0d
                    var total = 0.0d
                    for var sy = int32(Math.Floor(top)); sy < int32(Math.Ceiling(bottom)); sy++ {
                        let wy = Weight(sy, top, bottom, scaleY)
                        for var sx = int32(Math.Floor(left)); sx < int32(Math.Ceiling(right)); sx++ {
                            let weight = wy * Weight(sx, left, right, scaleX)
                            let p = pixels[Math.Clamp(sy, 0, height - 1) * width + Math.Clamp(sx, 0, width - 1)]
                            let a = float64(p.A) * weight
                            red += float64(p.R) * a
                            green += float64(p.G) * a
                            blue += float64(p.B) * a
                            alpha += a
                            total += weight
                        }
                    }
                    result[y * targetWidth + x] = if alpha > 0.0d {
                        CoverPixel(ToByte(red / alpha), ToByte(green / alpha), ToByte(blue / alpha), ToByte(alpha / total))
                    } else {
                        CoverPixel(0, 0, 0, 0)
                    }
                }
            }
            return result
        }

        private func Weight(pixel int32, start float64, end float64, scale float64) float64 ->
            if scale >= 1.0d {
                Math.Max(0.0d, Math.Min(end, float64(pixel + 1)) - Math.Max(start, float64(pixel)))
            } else {
                Math.Max(0.0d, 1.0d - Math.Abs(float64(pixel) - start))
            }

        private func ToByte(value float64) uint8 -> uint8(Math.Clamp(Math.Round(value), 0.0d, 255.0d))
    }
}
