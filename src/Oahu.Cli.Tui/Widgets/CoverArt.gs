package Oahu.Cli.Tui.Widgets

import SixLabors.ImageSharp
import SixLabors.ImageSharp.PixelFormats
import SixLabors.ImageSharp.Processing
import Spectre.Console
import System
import System.Collections.Concurrent
import System.Collections.Generic
import System.IO
import System.Net.Http
import System.Text
import System.Threading
import System.Threading.Tasks

/// Renders book cover art as truecolor half-block (`▀`) rows — two image pixels
/// per terminal cell — which works in any truecolor terminal without graphics
/// protocols.
///
/// Decoding (and, when needed, downloading) happens on a background task; the
/// caller polls (cref:TryGet) each frame and keeps its screen's timed refresh
/// running while a request is pending. Results are cached per `(path, width)`
/// for the lifetime of the process (a handful of KB per cover).
class CoverArt {
    /// State of one cover request.
    enum CoverState {
        Pending,
        Ready,
        Failed
    }

    /// A decoded cover: one markup string per terminal row.
    data class CoverResult {
        prop State CoverState {
            get;
            init;
        }

        prop Lines IReadOnlyList[string]? {
            get;
            init;
        }
    }

    shared {
        private let cache ConcurrentDictionary[string, CoverResult] = ConcurrentDictionary[string, CoverResult]()
        private let http HttpClient = HttpClient()

        /// Look up (or start producing) the cover for [`path`](paramref) at
        /// [`widthCells`](paramref) terminal columns. Returns a Pending result
        /// until the background decode finishes; callers should re-render while
        /// pending (the shell's timed-refresh loop covers this).
        func TryGet(path string?, url string?, widthCells int32) CoverResult {
            if string.IsNullOrWhiteSpace(path) {
                return Failed
            }
            let w = Math.Clamp(widthCells, 6, 60)
            let key = "$path|$w"
            if cache.TryGetValue(key, out var hit) && hit != nil {
                return hit
            }
            if cache.TryAdd(key, PendingResult) {
                let _ = Task.Run(() -> Produce(key, path!!, url, w))
            }
            return cache[key]
        }

        /// Drop every cached rendering (used by tests).
        func ClearCache() -> cache.Clear()

        private var prefetchRunning int32

        /// True while a background prefetch pass is in flight (for tests).
        prop IsPrefetching bool -> prefetchRunning != 0

        /// Lazily fill the shared on-disk cover cache for CLI-only users: the
        /// GUI downloads covers on sync, but a pure-CLI install never runs it.
        /// Walks the given (path, url) pairs on a background task and fetches
        /// any cover whose file is missing, one at a time with a small pause so
        /// the pass never competes with foreground work. At most one pass runs
        /// at a time; repeat calls while one is running are ignored.
        func Prefetch(covers IReadOnlyList[(Path string?, Url string?)]) {
            ArgumentNullException.ThrowIfNull(covers)
            if Interlocked.CompareExchange(ref prefetchRunning, 1, 0) != 0 {
                return
            }
            let _ = Task.Run(
                async () -> {
                    try {
                        for cover in covers {
                            let path = cover.Path
                            let url = cover.Url
                            if string.IsNullOrWhiteSpace(path) || string.IsNullOrWhiteSpace(url) {
                                continue
                            }
                            try {
                                if File.Exists(path) {
                                    continue
                                }
                                let bytes = await http.GetByteArrayAsync(url!!).ConfigureAwait(false)
                                let dir = Path.GetDirectoryName(path)
                                if !string.IsNullOrEmpty(dir) {
                                    Directory.CreateDirectory(dir!!)
                                }
                                File.WriteAllBytes(path!!, bytes)
                                await Task.Delay(150).ConfigureAwait(false)
                            } catch {
                                // Skip this cover; keep walking. Transient network
                                // failures resolve themselves on the next pass.

                            }
                        }
                    } finally {
                        Interlocked.Exchange(ref prefetchRunning, 0)
                    }
                }
            )
        }

        private let PendingResult CoverResult = CoverResult{State: CoverState.Pending, Lines: nil}

        private let Failed CoverResult = CoverResult{State: CoverState.Failed, Lines: nil}

        private func Produce(key string, path string, url string?, widthCells int32) {
            try {
                if !File.Exists(path) {
                    if string.IsNullOrWhiteSpace(url) {
                        cache[key] = Failed
                        return
                    }
                    // Cache-fill for CLI-only users: the GUI normally downloads
                    // covers; when it hasn't, fetch the same 500-px asset into
                    // the shared image cache.
                    let bytes = http.GetByteArrayAsync(url!!).GetAwaiter().GetResult()
                    let dir = Path.GetDirectoryName(path)
                    if !string.IsNullOrEmpty(dir) {
                        Directory.CreateDirectory(dir!!)
                    }
                    File.WriteAllBytes(path, bytes)
                }
                cache[key] = Decode(path, widthCells)
            } catch {
                cache[key] = Failed
            }
        }

        /// Quadrant glyphs indexed by a 4-bit "foreground" mask:
        /// bit 1 = upper-left, 2 = upper-right, 4 = lower-left, 8 = lower-right.
        private let QuadrantGlyphs[]string = []string{
            " ",
            "▘",
            "▝",
            "▀",
            "▖",
            "▌",
            "▞",
            "▛",
            "▗",
            "▚",
            "▐",
            "▜",
            "▄",
            "▙",
            "▟",
            "█"
        }

        private func Decode(path string, widthCells int32) CoverResult {
            let image = Image.Load[Rgba32](path)
            try {
                // Quadrant rendering packs a 2×2 pixel block into each cell
                // (each cell shows two colors split along the quadrant glyph),
                // doubling horizontal resolution over the classic half-block.
                // A terminal cell is ~1:2 (w:h), so a square cover maps to
                // widthCells columns × widthCells/2 rows ⇒ a pixel grid of
                // (2·widthCells) × widthCells.
                let rows = (widthCells + 1) / 2
                let pxWidth = widthCells * 2
                let pxHeight = rows * 2
                image.Mutate((ctx IImageProcessingContext) -> ctx.Resize(pxWidth, pxHeight))
                let pixels = [pxWidth * pxHeight]Rgba32
                image.CopyPixelDataTo(pixels)
                let lines = List[string](rows)
                for var row = 0; row < rows; row++ {
                    let sb = StringBuilder(widthCells * 28)
                    for var cx = 0; cx < widthCells; cx++ {
                        AppendQuadrantCell(sb, pixels, pxWidth, cx, row)
                    }
                    lines.Add(sb.ToString())
                }
                return CoverResult{State: CoverState.Ready, Lines: lines}
            } finally {
                image.Dispose()
            }
        }

        /// Renders one terminal cell from its 2×2 pixel block: pixels are split
        /// into a bright and a dark group around the block's mean luminance,
        /// the matching quadrant glyph is drawn with the bright group as the
        /// foreground color and the dark group as the background.
        private func AppendQuadrantCell(sb StringBuilder, pixels[]Rgba32, pxWidth int32, cx int32, row int32) {
            let quad = []Rgba32{
                pixels[(row * 2 * pxWidth) + (cx * 2)],
                pixels[(row * 2 * pxWidth) + (cx * 2) + 1],
                pixels[((row * 2 + 1) * pxWidth) + (cx * 2)],
                pixels[((row * 2 + 1) * pxWidth) + (cx * 2) + 1]
            }
            var lumaSum = 0.0d
            let luma = [4]float64
            for var i = 0; i < 4; i++ {
                luma[i] = (0.2126d * float64(quad[i].R)) +
                    (0.7152d * float64(quad[i].G)) +
                    (0.0722d * float64(quad[i].B))
                lumaSum += luma[i]
            }
            let mean = lumaSum / 4.0d
            var mask = 0
            var fr = 0
            var fg = 0
            var fb = 0
            var fn = 0
            var br = 0
            var bg = 0
            var bb = 0
            var bn = 0
            for var i = 0; i < 4; i++ {
                if luma[i] >= mean {
                    mask |= 1 << i
                    fr += int32(quad[i].R)
                    fg += int32(quad[i].G)
                    fb += int32(quad[i].B)
                    fn++
                } else {
                    br += int32(quad[i].R)
                    bg += int32(quad[i].G)
                    bb += int32(quad[i].B)
                    bn++
                }
            }
            // A flat block (all four pixels ≥ mean) has no background group;
            // reuse the foreground average so the cell is a solid █.
            if bn == 0 {
                br = fr
                bg = fg
                bb = fb
                bn = fn
            }
            // fn ≥ 1 always: at least the block's brightest pixel meets the mean.
            sb
                .Append("[#")
                .Append((fr / fn).ToString("x2"))
                .Append((fg / fn).ToString("x2"))
                .Append((fb / fn).ToString("x2"))
                .Append(" on #")
                .Append((br / bn).ToString("x2"))
                .Append((bg / bn).ToString("x2"))
                .Append((bb / bn).ToString("x2"))
                .Append(']')
                .Append(QuadrantGlyphs[mask])
                .Append("[/]")
        }
    }
}
