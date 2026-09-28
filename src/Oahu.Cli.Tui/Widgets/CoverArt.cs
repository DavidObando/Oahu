using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Oahu.Cli.Tui.Widgets;

public static class CoverArt
{
    public enum CoverState
    {
        Pending,
        Ready,
        Failed,
    }

    public sealed class CoverResult
    {
        public required CoverState State { get; init; }
        public IReadOnlyList<string>? Lines { get; init; }
    }

    private static readonly ConcurrentDictionary<string, CoverResult> Cache = new();
    private static readonly HttpClient Http = new();
    private static readonly CoverResult PendingResult = new() { State = CoverState.Pending };
    private static readonly CoverResult Failed = new() { State = CoverState.Failed };
    private static int _prefetchRunning;

    private static readonly string[] QuadrantGlyphs =
    [
        " ", "▘", "▝", "▀", "▖", "▌", "▞", "▛",
        "▗", "▚", "▐", "▜", "▄", "▙", "▟", "█",
    ];

    public static bool IsPrefetching => _prefetchRunning != 0;

    public static CoverResult TryGet(string? path, string? url, int widthCells)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return Failed;
        }

        var width = Math.Clamp(widthCells, 6, 60);
        var key = $"{path}|{width}";
        if (Cache.TryGetValue(key, out var hit))
        {
            return hit;
        }
        if (Cache.TryAdd(key, PendingResult))
        {
            _ = Task.Run(() => Produce(key, path, url, width));
        }
        return Cache[key];
    }

    public static void ClearCache() => Cache.Clear();

    public static void Prefetch(IReadOnlyList<(string? Path, string? Url)> covers)
    {
        ArgumentNullException.ThrowIfNull(covers);
        if (Interlocked.CompareExchange(ref _prefetchRunning, 1, 0) != 0)
        {
            return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                foreach (var cover in covers)
                {
                    if (string.IsNullOrWhiteSpace(cover.Path) || string.IsNullOrWhiteSpace(cover.Url))
                    {
                        continue;
                    }
                    try
                    {
                        if (File.Exists(cover.Path))
                        {
                            continue;
                        }
                        var bytes = await Http.GetByteArrayAsync(cover.Url).ConfigureAwait(false);
                        var directory = Path.GetDirectoryName(cover.Path);
                        if (!string.IsNullOrEmpty(directory))
                        {
                            Directory.CreateDirectory(directory);
                        }
                        File.WriteAllBytes(cover.Path, bytes);
                        await Task.Delay(150).ConfigureAwait(false);
                    }
                    catch
                    {
                        // Continue with the remaining covers.
                    }
                }
            }
            finally
            {
                Interlocked.Exchange(ref _prefetchRunning, 0);
            }
        });
    }

    private static void Produce(string key, string path, string? url, int widthCells)
    {
        try
        {
            if (!File.Exists(path))
            {
                if (string.IsNullOrWhiteSpace(url))
                {
                    Cache[key] = Failed;
                    return;
                }
                var bytes = Http.GetByteArrayAsync(url).GetAwaiter().GetResult();
                var directory = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }
                File.WriteAllBytes(path, bytes);
            }
            Cache[key] = Decode(path, widthCells);
        }
        catch
        {
            Cache[key] = Failed;
        }
    }

    private static CoverResult Decode(string path, int widthCells)
    {
        using var image = Image.Load<Rgba32>(path);
        var rows = (widthCells + 1) / 2;
        var pixelWidth = widthCells * 2;
        var pixelHeight = rows * 2;
        image.Mutate(context => context.Resize(pixelWidth, pixelHeight));
        var pixels = new Rgba32[pixelWidth * pixelHeight];
        image.CopyPixelDataTo(pixels);
        var lines = new List<string>(rows);
        for (var row = 0; row < rows; row++)
        {
            var builder = new StringBuilder(widthCells * 28);
            for (var column = 0; column < widthCells; column++)
            {
                AppendQuadrantCell(builder, pixels, pixelWidth, column, row);
            }
            lines.Add(builder.ToString());
        }
        return new CoverResult { State = CoverState.Ready, Lines = lines };
    }

    private static void AppendQuadrantCell(
        StringBuilder builder,
        Rgba32[] pixels,
        int pixelWidth,
        int column,
        int row)
    {
        var quad = new[]
        {
            pixels[(row * 2 * pixelWidth) + (column * 2)],
            pixels[(row * 2 * pixelWidth) + (column * 2) + 1],
            pixels[((row * 2 + 1) * pixelWidth) + (column * 2)],
            pixels[((row * 2 + 1) * pixelWidth) + (column * 2) + 1],
        };
        var luminance = new double[4];
        var luminanceSum = 0d;
        for (var i = 0; i < 4; i++)
        {
            luminance[i] = (0.2126 * quad[i].R) + (0.7152 * quad[i].G) + (0.0722 * quad[i].B);
            luminanceSum += luminance[i];
        }

        var mean = luminanceSum / 4d;
        var mask = 0;
        var foregroundRed = 0;
        var foregroundGreen = 0;
        var foregroundBlue = 0;
        var foregroundCount = 0;
        var backgroundRed = 0;
        var backgroundGreen = 0;
        var backgroundBlue = 0;
        var backgroundCount = 0;
        for (var i = 0; i < 4; i++)
        {
            if (luminance[i] >= mean)
            {
                mask |= 1 << i;
                foregroundRed += quad[i].R;
                foregroundGreen += quad[i].G;
                foregroundBlue += quad[i].B;
                foregroundCount++;
            }
            else
            {
                backgroundRed += quad[i].R;
                backgroundGreen += quad[i].G;
                backgroundBlue += quad[i].B;
                backgroundCount++;
            }
        }
        if (backgroundCount == 0)
        {
            backgroundRed = foregroundRed;
            backgroundGreen = foregroundGreen;
            backgroundBlue = foregroundBlue;
            backgroundCount = foregroundCount;
        }

        builder
            .Append("[#")
            .Append((foregroundRed / foregroundCount).ToString("x2"))
            .Append((foregroundGreen / foregroundCount).ToString("x2"))
            .Append((foregroundBlue / foregroundCount).ToString("x2"))
            .Append(" on #")
            .Append((backgroundRed / backgroundCount).ToString("x2"))
            .Append((backgroundGreen / backgroundCount).ToString("x2"))
            .Append((backgroundBlue / backgroundCount).ToString("x2"))
            .Append(']')
            .Append(QuadrantGlyphs[mask])
            .Append("[/]");
    }
}
