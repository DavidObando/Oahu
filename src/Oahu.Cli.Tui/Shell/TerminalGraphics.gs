package Oahu.Cli.Tui.Shell

import Oahu.Cli.Tui.Widgets
import Oahu.Cli.Tui.Hooks
import Oahu.Cli.Tui.Tokens
import Oahu.Cli.Tui.Icons
import System
import System.Collections.Generic
import System.Globalization
import System.Text
import System.Text.RegularExpressions
import Spectre.Console.Rendering
import System.Linq

internal class TerminalGraphics {
    prop Protocol ImageProtocol { get; private set; }
    prop CellWidth int32 { get; private set; }
    prop CellHeight int32 { get; private set; }

    private let imageId int32 = Random.Shared.Next(1, int32.MaxValue)
    private var uploaded TerminalImage?
    private var sixel string?
    private var sixelWidth int32
    private var sixelHeight int32
    private var sixelBackground CoverPixel

    func Probe(reader AppShell.ConsoleKeyReader) {
        if Console.IsOutputRedirected || Console.IsInputRedirected || ScreenReaderProbe.IsActive() ||
            !Tokens.HasBackdrop || Icons.ForceAscii ||
            !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TMUX")) ||
            !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("STY")) {
            return
        }
        let preference = (Environment.GetEnvironmentVariable("OAHU_IMAGE_PROTOCOL") ?? "auto").Trim().ToLowerInvariant()
        if preference == "quadrant" || preference == "off" { return }
        Console.Out.Write("\u001B_Gi=2147483647,s=1,v=1,a=q,t=d,f=24;AAAA\u001B\\\u001B[16t\u001B[14t\u001B[c")
        Console.Out.Flush()
        let keys = List[ConsoleKeyInfo]()
        let text = StringBuilder()
        let deadline = Environment.TickCount64 + 350
        while Environment.TickCount64 < deadline && keys.Count < 4096 {
            if reader.TryReadKey(10, out var key) {
                keys.Add(key)
                text.Append(key.KeyChar)
            }
        }
        let response = text.ToString()
        Configure(response, preference, Console.WindowWidth, Console.WindowHeight)
        // Preserve keystrokes typed during negotiation; only consume our replies.
        let consumed = [keys.Count]bool
        for match Match in Replies.Matches(response) {
            for var i = match.Index; i < match.Index + match.Length; i++ { consumed[i] = true }
        }
        for var i = 0; i < keys.Count; i++ {
            if !consumed[i] { reader.PushBack(keys[i]) }
        }
    }

    internal func Configure(response string, preference string, columns int32, rows int32) {
        CellHeight = 0
        CellWidth = 0
        let cell = Regex.Match(response, "\u001B\\[6;(\\d+);(\\d+)t")
        let area = Regex.Match(response, "\u001B\\[4;(\\d+);(\\d+)t")
        if cell.Success && int32.TryParse(cell.Groups[1].Value, out var ch) &&
            int32.TryParse(cell.Groups[2].Value, out var cw) && ch > 0 && cw > 0 {
            CellHeight = ch
            CellWidth = cw
        } else if area.Success && columns > 0 && rows > 0 &&
            int32.TryParse(area.Groups[1].Value, out var ah) && int32.TryParse(area.Groups[2].Value, out var aw) {
            CellHeight = ah / rows
            CellWidth = aw / columns
        }
        if CellWidth <= 0 || CellHeight <= 0 || CellWidth > 128 || CellHeight > 256 {
            CellWidth = 0
            CellHeight = 0
        }
        let kitty = response.Contains("\u001B_Gi=2147483647;OK\u001B\\", StringComparison.Ordinal)
        let da = Regex.Match(response, "\u001B\\[\\?([0-9;]+)c")
        let sixelSupported = da.Success && da.Groups[1].Value.Split(';').Skip(1).Contains("4")
        Protocol = if preference != "sixel" && preference != "quadrant" && preference != "off" && kitty {
            ImageProtocol.Kitty
        } else if preference != "kitty" && preference != "quadrant" && preference != "off" &&
            sixelSupported && CellWidth > 0 && CellHeight > 0 {
            ImageProtocol.Sixel
        } else { ImageProtocol.Quadrant }
    }

    func Paint(frame string, placement ImagePlacement?) string {
        if placement == nil { return Delete() + frame }
        let resolved = Resolve(frame, placement.Columns, placement.Rows)
        if !resolved.Visible {
            return Delete() + resolved.Frame
        }
        let sb = StringBuilder()
        if Protocol == ImageProtocol.Kitty {
            if !Object.ReferenceEquals(uploaded, placement.Image) {
                sb.Append(Delete())
                sb.Append(TerminalImageEncoder.Kitty(placement.Image, imageId))
                uploaded = placement.Image
            } else {
                sb.Append("\u001B_Ga=d,d=i,i=$imageId,q=2;\u001B\\")
            }
        }
        sb.Append(resolved.Frame)
        sb.Append("\u001B7\u001B[${resolved.Y + 1};${resolved.X + 1}H")
        if Protocol == ImageProtocol.Kitty {
            let cw = if CellWidth > 0 { CellWidth } else { 1 }
            let ch = if CellHeight > 0 { CellHeight } else { 2 }
            let fitsWidth = int64(placement.Columns) * cw * placement.Image.Height <= int64(placement.Rows) * ch * placement.Image.Width
            let size = if fitsWidth { "c=${placement.Columns}" } else { "r=${placement.Rows}" }
            sb.Append("\u001B_Ga=p,i=$imageId,p=1,$size,C=1,q=2;\u001B\\")
        } else if Protocol == ImageProtocol.Sixel {
            let scale = Math.Min(float64(placement.Columns * CellWidth) / placement.Image.Width,
                float64(placement.Rows * CellHeight) / placement.Image.Height)
            let width = Math.Max(1, int32(Math.Floor(placement.Image.Width * scale)))
            let height = Math.Max(1, int32(Math.Floor(placement.Image.Height * scale)))
            if sixel == nil || !Object.ReferenceEquals(uploaded, placement.Image) ||
                width != sixelWidth || height != sixelHeight || placement.Background != sixelBackground {
                sixel = TerminalImageEncoder.Sixel(placement.Image, width, height, placement.Background)
                uploaded = placement.Image
                sixelWidth = width
                sixelHeight = height
                sixelBackground = placement.Background
            }
            // DECSDM off: draw at the cursor without scrolling the text frame.
            sb.Append("\u001B[?80s\u001B[?80l").Append(sixel).Append("\u001B[?80r")
        }
        return sb.Append("\u001B8").ToString()
    }

    func Delete() string {
        let result = if uploaded != nil && Protocol == ImageProtocol.Kitty {
            "\u001B_Ga=d,d=I,i=$imageId,q=2;\u001B\\"
        } else { string.Empty }
        uploaded = nil
        sixel = nil
        return result
    }

    shared {
        private let Replies Regex = Regex("\u001B_Gi=2147483647;[^\u001B]*\u001B\\\\|\u001B\\[[46];[0-9;]+t|\u001B\\[\\?[0-9;]+c")

        // Private-use cells survive Spectre padding/slicing with width one.
        // Only complete rectangles are painted; clipped/overlaid cells are blank.
        func Marker(row int32, columns int32) string -> String(char(0xe000 + row), columns)

        internal func Resolve(frame string, columns int32, rows int32) (Frame string, Visible bool, X int32, Y int32) {
            let sb = StringBuilder(frame.Length)
            var x = 0
            var y = 0
            var originX = -1
            var originY = -1
            let counts = [rows]int32
            var valid = true
            for var i = 0; i < frame.Length; i++ {
                let c = frame[i]
                if c == char(27) && i + 1 < frame.Length && frame[i + 1] == '[' {
                    let start = i
                    i += 2
                    while i < frame.Length && !(frame[i] >= char(0x40) && frame[i] <= char(0x7e)) { i++ }
                    sb.Append(frame, start, Math.Min(i + 1, frame.Length) - start)
                    continue
                }
                let row = int32(c) - 0xe000
                if row >= 0 && row < rows {
                    if originX < 0 {
                        originX = x
                        originY = y - row
                    }
                    if x != originX + counts[row] || y != originY + row { valid = false }
                    counts[row]++
                    sb.Append(' ')
                    x++
                    continue
                } else if c != '\n' && c != '\r' {
                    let start = i
                    while i + 1 < frame.Length && frame[i + 1] != char(27) &&
                        frame[i + 1] != '\n' && frame[i + 1] != '\r' &&
                        !(frame[i + 1] >= char(0xe000) && frame[i + 1] < char(0xe000 + rows)) {
                        i++
                    }
                    let text = frame.Substring(start, i + 1 - start)
                    sb.Append(text)
                    x += Segment(text).CellCount()
                    continue
                } else {
                    sb.Append(c)
                }
                if c == '\n' {
                    x = 0
                    y++
                }
                else if c == '\r' { x = 0 }
            }
            for count in counts { if count != columns { valid = false } }
            return (sb.ToString(), valid && originX >= 0, originX, originY)
        }
    }
}
