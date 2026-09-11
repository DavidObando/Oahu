package Oahu.Decrypt.Mpeg4

import Oahu.Decrypt.Mpeg4.Util
import System
import System.IO
import System.Text

open data class Chapter {
    init(title string, start TimeSpan, duration TimeSpan) {
        ArgumentNullException.ThrowIfNull(title, "title")
        Title = title
        StartOffset = start
        Duration = duration
        EndOffset = StartOffset + Duration
    }

    prop Title string {
        get;
        init;
    }

    prop StartOffset TimeSpan {
        get;
        init;
    }

    prop Duration TimeSpan {
        get;
        init;
    }

    prop EndOffset TimeSpan {
        get;
        init;
    }

    prop RenderSize int32 -> 2 + Encoding.UTF8.GetByteCount(Title) + Encd.Length

    func WriteChapter(output Stream) {
        let title = Encoding.UTF8.GetBytes(Title)
        output.WriteInt16BE(int16(title.Length))
        output.Write(title)
        output.Write(Encd)
    }

    open override func ToString() string {
        return "$Title {$StartOffset - $EndOffset}"
    }

    shared {
        // This is constant folr UTF-8 text
        // https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/movenc.c
        private let Encd[]uint8 = []uint8{
            uint8(0),
            uint8(0),
            uint8(0),
            uint8(0xc),
            uint8('e'),
            uint8('n'),
            uint8('c'),
            uint8('d'),
            uint8(0),
            uint8(0),
            uint8(1),
            uint8(0)
        }
    }
}
