package Oahu.Cli.Tui.Widgets

import System
import System.Text
import System.Globalization
import System.Collections.Generic
import System.Linq
import System.IO
import System.IO.Compression

internal enum ImageProtocol {
    Quadrant,
    Kitty,
    Sixel
}

internal data class TerminalImage(Width int32, Height int32, Pixels[]CoverPixel)

internal data class ImagePlacement(Image TerminalImage, Columns int32, Rows int32, Background CoverPixel)

internal class TerminalImageEncoder {
    shared {
        func Kitty(image TerminalImage, id int32) string {
            let bytes = [image.Pixels.Length * 4]uint8
            for var i = 0; i < image.Pixels.Length; i++ {
                let p = image.Pixels[i]
                bytes[i * 4] = p.R
                bytes[i * 4 + 1] = p.G
                bytes[i * 4 + 2] = p.B
                bytes[i * 4 + 3] = p.A
            }
            using let output = MemoryStream()
            Compress(output, bytes)
            let data = Convert.ToBase64String(output.ToArray())
            let sb = StringBuilder()
            for var offset = 0; offset < data.Length; offset += 4096 {
                let length = Math.Min(4096, data.Length - offset)
                let more = if offset + length < data.Length { 1 } else { 0 }
                let header = if offset == 0 { "a=t,f=32,o=z,s=${image.Width},v=${image.Height},i=$id,q=2," } else { "q=2," }
                sb.Append("\u001B_G${header}m=$more;").Append(data, offset, length).Append("\u001B\\")
            }
            return sb.ToString()
        }

        private func Compress(output Stream, bytes[]uint8) {
            using let compressor = ZLibStream(output, CompressionLevel.Fastest, leaveOpen: true)
            compressor.Write(bytes)
        }

        // Transparent pixels are composited onto the pane because Sixel has
        // no alpha channel. Quantization happens once per cover and target size.
        func Sixel(image TerminalImage, width int32, height int32, background CoverPixel) string {
            let pixels = CoverImage.Resize(image.Pixels, image.Width, image.Height, width, height)
            for var i = 0; i < pixels.Length; i++ {
                let p = pixels[i]
                let a = int32(p.A)
                let r = (int32(p.R) * a + int32(background.R) * (255 - a) + 127) / 255
                let g = (int32(p.G) * a + int32(background.G) * (255 - a) + 127) / 255
                let b = (int32(p.B) * a + int32(background.B) * (255 - a) + 127) / 255
                pixels[i] = CoverPixel(uint8(r), uint8(g), uint8(b), 255)
            }
            let quantized = Quantize(pixels)
            let indices = quantized.Indices
            let palette = quantized.Palette
            let sb = StringBuilder("\u001BP0;1;0q\"1;1;$width;$height")
            for var color = 0; color < palette.Length; color++ {
                let p = palette[color]
                sb.Append("#$color;2;${(int32(p.R) * 100 + 127) / 255};${(int32(p.G) * 100 + 127) / 255};${(int32(p.B) * 100 + 127) / 255}")
            }
            let masks = [width]int32
            for var y = 0; y < height; y += 6 {
                var first = true
                for var color = 0; color < palette.Length; color++ {
                    Array.Clear(masks)
                    var last = -1
                    for var dy = 0; dy < 6 && y + dy < height; dy++ {
                        for var x = 0; x < width; x++ {
                            if indices[(y + dy) * width + x] == color {
                                masks[x] |= 1 << dy
                                last = Math.Max(last, x)
                            }
                        }
                    }
                    if last < 0 { continue }
                    if !first { sb.Append('$') }
                    first = false
                    sb.Append("#$color")
                    for var x = 0; x <= last; {
                        let mask = masks[x]
                        var end = x + 1
                        while end <= last && masks[end] == mask { end++ }
                        let count = end - x
                        if count >= 4 {
                            sb.Append('!').Append(count.ToString(CultureInfo.InvariantCulture)).Append(char(63 + mask))
                        } else {
                            sb.Append(char(63 + mask), count)
                        }
                        x = end
                    }
                }
                if y + 6 < height { sb.Append('-') }
            }
            return sb.Append("\u001B\\").ToString()
        }

        // Weighted median-cut over a 15-bit histogram retains photographic
        // colors without an expensive nearest-color search for every pixel.
        private func Quantize(pixels[]CoverPixel) (Indices[]int32, Palette[]CoverPixel) {
            let counts = [32768]int32
            let reds = [32768]int64
            let greens = [32768]int64
            let blues = [32768]int64
            for p in pixels {
                let bin = Bin(p)
                counts[bin]++
                reds[bin] += p.R
                greens[bin] += p.G
                blues[bin] += p.B
            }
            let colors = [32768]CoverPixel
            let keys = List[int32]()
            for var bin = 0; bin < counts.Length; bin++ {
                if counts[bin] > 0 {
                    keys.Add(bin)
                    colors[bin] = CoverPixel(uint8(reds[bin] / counts[bin]), uint8(greens[bin] / counts[bin]), uint8(blues[bin] / counts[bin]), 255)
                }
            }
            let boxes = List[ColorBox]{ColorBox(keys.ToArray(), colors, counts)}
            while boxes.Count < 256 {
                var selected = -1
                var score = 0.0d
                for var i = 0; i < boxes.Count; i++ {
                    if boxes[i].Keys.Length > 1 && boxes[i].Score > score {
                        score = boxes[i].Score
                        selected = i
                    }
                }
                if selected < 0 { break }
                let box = boxes[selected]
                Array.Sort(box.Keys, (a int32, b int32) -> Channel(colors[a], box.Axis).CompareTo(Channel(colors[b], box.Axis)))
                var weight = 0
                var split = 0
                while split < box.Keys.Length - 1 && weight < box.Weight / 2 {
                    weight += counts[box.Keys[split]]
                    split++
                }
                split = Math.Clamp(split, 1, box.Keys.Length - 1)
                boxes[selected] = ColorBox(box.Keys.Take(split).ToArray(), colors, counts)
                boxes.Add(ColorBox(box.Keys.Skip(split).ToArray(), colors, counts))
            }
            let palette = [boxes.Count]CoverPixel
            for var i = 0; i < boxes.Count; i++ {
                var r = int64(0)
                var g = int64(0)
                var b = int64(0)
                for bin in boxes[i].Keys {
                    r += reds[bin]
                    g += greens[bin]
                    b += blues[bin]
                }
                let weight = boxes[i].Weight
                palette[i] = CoverPixel(uint8(r / weight), uint8(g / weight), uint8(b / weight), 255)
            }
            let lookup = [32768]int32
            for bin in keys {
                let p = colors[bin]
                var nearest = 0
                var distance = int32.MaxValue
                for var i = 0; i < palette.Length; i++ {
                    let dr = int32(p.R) - int32(palette[i].R)
                    let dg = int32(p.G) - int32(palette[i].G)
                    let db = int32(p.B) - int32(palette[i].B)
                    let d = dr * dr + dg * dg + db * db
                    if d < distance {
                        distance = d
                        nearest = i
                    }
                }
                lookup[bin] = nearest
            }
            let indices = [pixels.Length]int32
            for var i = 0; i < pixels.Length; i++ { indices[i] = lookup[Bin(pixels[i])] }
            return (indices, palette)
        }

        private func Bin(p CoverPixel) int32 -> ((int32(p.R) >> 3) << 10) | ((int32(p.G) >> 3) << 5) | (int32(p.B) >> 3)

        private func Channel(p CoverPixel, axis int32) int32 -> if axis == 0 { int32(p.R) } else if axis == 1 { int32(p.G) } else { int32(p.B) }
    }

    private class ColorBox {
        prop Keys[]int32 { get; }
        prop Axis int32 { get; }
        prop Weight int32 { get; }
        prop Score float64 { get; }

        init(keys[]int32, colors[]CoverPixel, counts[]int32) {
            Keys = keys
            let min = []int32{255, 255, 255}
            let max = []int32{0, 0, 0}
            var weight = 0
            for key in keys {
                weight += counts[key]
                for var axis = 0; axis < 3; axis++ {
                    let channel = Channel(colors[key], axis)
                    min[axis] = Math.Min(min[axis], channel)
                    max[axis] = Math.Max(max[axis], channel)
                }
            }
            var longest = 0
            var selected = 0
            for var axis = 0; axis < 3; axis++ {
                if max[axis] - min[axis] > longest {
                    longest = max[axis] - min[axis]
                    selected = axis
                }
            }
            Axis = selected
            Weight = weight
            Score = float64(longest) * Math.Sqrt(float64(weight))
        }
    }
}
