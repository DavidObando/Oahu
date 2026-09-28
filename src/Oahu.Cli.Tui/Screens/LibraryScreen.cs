using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Oahu.Cli.App.Library;
using Oahu.Cli.App.Models;
using Oahu.Cli.App.Queue;
using Oahu.Cli.Tui.Icons;
using Oahu.Cli.Tui.Shell;
using Oahu.Cli.Tui.Widgets;
using Spectre.Console;
using Spectre.Console.Rendering;

namespace Oahu.Cli.Tui.Screens;

/// <summary>
/// Library screen (tab 2). Searchable, multi-select table with detail
/// panel. Per design TUI-exploration §3–4.
/// </summary>
public sealed class LibraryScreen : ITabScreen
{
    private readonly AppShellState state;
    private readonly Func<ILibraryService> libraryServiceFactory;
    private readonly Func<IQueueService>? queueServiceFactory;
    private readonly HashSet<string> selected = new(StringComparer.Ordinal);
    private readonly TextInput searchInput = new() { Label = "/", MaxLength = 128 };

    private IReadOnlyList<LibraryItem> allItems = Array.Empty<LibraryItem>();
    private IReadOnlyList<LibraryItem> filtered = Array.Empty<LibraryItem>();
    private int cursor;
    private int scrollOffset;
    private int lastListHeight = 20;
    private bool loaded;
    private int lastSeenLibraryGeneration;
    private bool searchMode;

    private IAppShellNavigator? navigator;
    private Task? enqueueTask;
    private bool coverPending;
    private int lastListTop = 2;
    private int lastListWidth = 80;

    public LibraryScreen(AppShellState state, Func<ILibraryService> libraryServiceFactory)
        : this(state, libraryServiceFactory, queueServiceFactory: null)
    {
    }

    public LibraryScreen(
        AppShellState state,
        Func<ILibraryService> libraryServiceFactory,
        Func<IQueueService>? queueServiceFactory)
    {
        this.state = state ?? throw new ArgumentNullException(nameof(state));
        this.libraryServiceFactory = libraryServiceFactory ?? throw new ArgumentNullException(nameof(libraryServiceFactory));
        this.queueServiceFactory = queueServiceFactory;
    }

    public string Title => "Library";

    public char NumberKey => '2';

    public bool NeedsTimedRefresh => coverPending;

    public int Cursor => cursor;

    public int SelectedCount => selected.Count;

    public IReadOnlyList<LibraryItem> Items => filtered;

    public IEnumerable<KeyValuePair<string, string?>> Hints
    {
        get
        {
            if (searchMode)
            {
                yield return new("enter", "search");
                yield return new("esc", "cancel");
            }
            else
            {
                yield return new("/", "search");
                yield return new("↑↓", "navigate");
                yield return new("space", "select");
                yield return new("a", "select all");
                if (queueServiceFactory is not null)
                {
                    yield return new("e", "enqueue");
                }
            }
        }
    }

    public Task? OnActivatedAsync(IAppShellNavigator navigator)
    {
        this.navigator = navigator;
        if (!loaded)
        {
            loaded = true;
            lastSeenLibraryGeneration = state.LibraryGeneration;
            return LoadAsync();
        }

        // The user pressed 'r' on Home (or another screen invalidated the
        // library cache) while we were on a different tab — pull a fresh
        // snapshot so the new title shows up without restarting.
        if (state.LibraryGeneration != lastSeenLibraryGeneration)
        {
            lastSeenLibraryGeneration = state.LibraryGeneration;
            return LoadAsync();
        }

        return null;
    }

    public IRenderable Render(int width, int height)
    {
        var detailWidth = width >= 96 ? Math.Clamp(width * 2 / 5, 34, 44) : 0;
        var listWidth = detailWidth > 0 ? width - detailWidth - 1 : width;
        lastListWidth = listWidth;
        var list = RenderList(listWidth, height);
        if (detailWidth == 0)
        {
            return list;
        }

        var paneColor = Tokens.Tokens.BackgroundSecondary.Value;
        var paneFill = Tokens.Tokens.HasBackdrop ? new Style(background: paneColor) : Style.Plain;
        var pane = new FixedHeight(
            new Backdrop(RenderDetail(detailWidth - 4, height), paneColor, padLeft: 2, padRight: 2, padTop: 1),
            height,
            paneFill);
        return new SideBySide(list, listWidth, 1, pane, detailWidth);
    }

    private IRenderable RenderList(int width, int height)
    {
        var lines = new List<IRenderable>();

        var primary = Tokens.Tokens.TextPrimary.Value.ToMarkup();
        var secondary = Tokens.Tokens.TextSecondary.Value.ToMarkup();
        var tertiary = Tokens.Tokens.TextTertiary.Value.ToMarkup();
        var brand = Tokens.Tokens.Brand.Value.ToMarkup();
        var success = Tokens.Tokens.StatusSuccess.Value.ToMarkup();

        lines.Add(new Markup(" "));
        if (searchMode)
        {
            lines.Add(searchInput.Render());
        }
        else if (!string.IsNullOrEmpty(searchInput.Text))
        {
            lines.Add(new Markup($"[{tertiary}]Filter: {Markup.Escape(searchInput.Text)}  (/ to change, Esc to clear)[/]"));
        }

        // Summary line
        var selStr = selected.Count > 0 ? $"  [{brand}]{selected.Count} selected[/]" : string.Empty;
        lines.Add(new Markup($"[{secondary}]{filtered.Count} of {allItems.Count} titles{selStr}[/]"));
        lines.Add(new Markup(" "));

        if (filtered.Count == 0)
        {
            lines.Add(new Markup($"[{tertiary}]{(allItems.Count == 0 ? "Library is empty. Sync from the Home tab." : "No matches.")}[/]"));
            return new Padder(new Rows(lines)).Padding(2, 0, 2, 0);
        }

        // Visible rows
        var listHeight = Math.Max(1, height - lines.Count - 2);
        lastListHeight = listHeight;
        lastListTop = lines.Count;
        AdjustScroll(listHeight);

        var end = Math.Min(scrollOffset + listHeight, filtered.Count);
        for (var i = scrollOffset; i < end; i++)
        {
            var item = filtered[i];
            var isCursor = i == cursor;
            var isSel = selected.Contains(item.Asin);
            var mark = isSel ? $"[{success}]✓[/]" : " ";
            var pointer = isCursor ? $"[{brand}]❯[/]" : " ";
            var style = isCursor ? $"bold {primary}" : secondary;
            var authors = item.Authors.Length > 0 ? string.Join(", ", item.Authors) : string.Empty;
            var runtime = item.Runtime is { } r ? FormatRuntime(r) : string.Empty;

            var runtimeWidth = 7;
            var authorWidth = Math.Clamp((width - 14 - runtimeWidth) / 3, 12, 30);
            var titleWidth = Math.Max(12, width - 10 - authorWidth - runtimeWidth);
            var titleCell = Truncate(item.Title, titleWidth).PadRight(titleWidth);
            var authorCell = Truncate(authors, authorWidth).PadRight(authorWidth);
            var runtimeCell = runtime.PadLeft(runtimeWidth);
            var rowText = $"{pointer} {mark} [{style}]{Markup.Escape(titleCell)}[/] " +
                          $"[{tertiary}]{Markup.Escape(authorCell)}[/]" +
                          $"[{tertiary}]{Markup.Escape(runtimeCell)}[/]";
            lines.Add(isCursor && Tokens.Tokens.HasBackdrop
                ? new Backdrop(new Markup(rowText), Tokens.Tokens.InputBackground.Value, padLeft: 2, padRight: 1)
                : new Padder(new Markup(rowText)).Padding(2, 0, 0, 0));
        }

        if (filtered.Count > listHeight)
        {
            lines.Add(new Markup($"  [{tertiary}]↕ {scrollOffset + 1}–{end} of {filtered.Count}[/]"));
        }

        return new Rows(lines);
    }

    private IRenderable RenderDetail(int width, int height)
    {
        coverPending = false;
        var lines = new List<IRenderable>();
        var primary = Tokens.Tokens.TextPrimary.Value.ToMarkup();
        var secondary = Tokens.Tokens.TextSecondary.Value.ToMarkup();
        var tertiary = Tokens.Tokens.TextTertiary.Value.ToMarkup();
        var brand = Tokens.Tokens.Brand.Value.ToMarkup();
        if (cursor < 0 || cursor >= filtered.Count)
        {
            lines.Add(new Markup($"[{tertiary}]No selection.[/]"));
            return new Rows(lines);
        }

        var item = filtered[cursor];
        if (Tokens.Tokens.HasBackdrop && !Icons.Icons.ForceAscii)
        {
            var coverWidth = Math.Min(width, 26);
            var cover = CoverArt.TryGet(item.CoverImagePath, item.CoverImageUrl, coverWidth);
            if (cover.State == CoverArt.CoverState.Ready && cover.Lines is not null)
            {
                foreach (var line in cover.Lines)
                {
                    lines.Add(new Markup(line));
                }
                lines.Add(new Markup(" "));
            }
            else if (cover.State == CoverArt.CoverState.Pending)
            {
                coverPending = true;
                var placeholder = new string('░', Math.Max(1, coverWidth));
                for (var row = 0; row < Math.Max(1, coverWidth / 2); row++)
                {
                    lines.Add(new Markup($"[{tertiary}]{placeholder}[/]"));
                }
                lines.Add(new Markup(" "));
            }
        }

        lines.Add(new Markup($"[{primary} bold]{Markup.Escape(item.Title)}[/]"));
        if (item.Subtitle is { } subtitle)
        {
            lines.Add(new Markup($"[{secondary}]{Markup.Escape(subtitle)}[/]"));
        }
        lines.Add(new Markup(" "));
        if (item.Authors.Length > 0)
        {
            lines.Add(new Markup($"[{secondary}]by {Markup.Escape(string.Join(", ", item.Authors))}[/]"));
        }
        if (item.Narrators.Length > 0)
        {
            lines.Add(new Markup($"[{tertiary}]read by {Markup.Escape(string.Join(", ", item.Narrators))}[/]"));
        }
        if (item.Series is { } series)
        {
            var position = item.SeriesPosition is { } seriesPosition ? $" · #{seriesPosition:0.###}" : string.Empty;
            lines.Add(new Markup($"[{tertiary}]{Markup.Escape(series)}{position}[/]"));
        }
        lines.Add(new Markup(" "));
        var facts = new List<string>();
        if (item.Runtime is { } runtime)
        {
            facts.Add(FormatRuntime(runtime));
        }
        if (item.PurchaseDate is { } purchased)
        {
            facts.Add($"added {purchased.ToLocalTime().ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)}");
        }
        if (item.HasMultiplePartFiles)
        {
            facts.Add("multi-part");
        }
        if (facts.Count > 0)
        {
            lines.Add(new Markup($"[{tertiary}]{Markup.Escape(string.Join("  ·  ", facts))}[/]"));
        }
        if (selected.Contains(item.Asin))
        {
            lines.Add(new Markup(" "));
            lines.Add(new Markup($"[{Tokens.Tokens.StatusSuccess.Value.ToMarkup()}]✓ selected[/]"));
        }
        lines.Add(new Markup(" "));
        lines.Add(new Markup($"[{brand}]e[/] [{tertiary}]enqueue for download[/]"));
        return new Rows(lines);
    }

    public bool HandleScroll(int delta)
    {
        if (filtered.Count == 0)
        {
            return true;
        }
        cursor = Math.Clamp(cursor + delta, 0, filtered.Count - 1);
        return true;
    }

    public bool HandleClick(int x, int y)
    {
        if (x >= lastListWidth)
        {
            return false;
        }
        var index = scrollOffset + y - lastListTop;
        if (y < lastListTop || index < 0 || index >= filtered.Count || index >= scrollOffset + lastListHeight)
        {
            return false;
        }
        if (index == cursor)
        {
            var asin = filtered[index].Asin;
            if (!selected.Remove(asin))
            {
                selected.Add(asin);
            }
        }
        else
        {
            cursor = index;
        }
        return true;
    }

    public bool HandleKey(ConsoleKeyInfo key)
    {
        if (searchMode)
        {
            switch (key.Key)
            {
                case ConsoleKey.Enter:
                    searchMode = false;
                    ApplyFilter();
                    return true;
                case ConsoleKey.Escape:
                    searchMode = false;
                    searchInput.Text = string.Empty;
                    ApplyFilter();
                    return true;
                default:
                    return searchInput.HandleKey(key);
            }
        }

        switch (key.Key)
        {
            case ConsoleKey.UpArrow:
            case ConsoleKey.K:
                cursor = Math.Max(0, cursor - 1);
                return true;
            case ConsoleKey.DownArrow:
            case ConsoleKey.J:
                cursor = Math.Min(filtered.Count - 1, Math.Max(0, cursor + 1));
                return true;
            case ConsoleKey.PageUp:
                cursor = Math.Max(0, cursor - lastListHeight);
                return true;
            case ConsoleKey.PageDown:
                cursor = Math.Min(filtered.Count - 1, Math.Max(0, cursor + lastListHeight));
                return true;
            case ConsoleKey.Home:
                cursor = 0;
                return true;
            case ConsoleKey.End:
                cursor = Math.Max(0, filtered.Count - 1);
                return true;
            case ConsoleKey.Spacebar:
                if (cursor >= 0 && cursor < filtered.Count)
                {
                    var asin = filtered[cursor].Asin;
                    if (!selected.Remove(asin))
                    {
                        selected.Add(asin);
                    }
                }
                return true;
            case ConsoleKey.A when key.Modifiers == 0:
                if (selected.Count == filtered.Count)
                {
                    selected.Clear();
                }
                else
                {
                    foreach (var item in filtered)
                    {
                        selected.Add(item.Asin);
                    }
                }
                return true;
            case ConsoleKey.Escape:
                if (!string.IsNullOrEmpty(searchInput.Text))
                {
                    searchInput.Text = string.Empty;
                    ApplyFilter();
                    return true;
                }
                if (selected.Count > 0)
                {
                    selected.Clear();
                    return true;
                }
                break;
            case ConsoleKey.E when key.Modifiers == 0:
                return EnqueueSelection();
        }

        if (key.KeyChar == '/')
        {
            searchMode = true;
            return true;
        }

        return false;
    }

    /// <summary>Load library items synchronously (used by tests and explicit refresh).</summary>
    public void Reload()
    {
        try
        {
            var lib = libraryServiceFactory();
            allItems = lib.ListAsync().GetAwaiter().GetResult();
            loaded = true;
            ApplyFilter();
            PrefetchCovers();
        }
        catch
        {
            loaded = true;
            // Swallow to keep TUI stable.
        }
    }

    /// <summary>Load library items asynchronously (returned to shell for tracking).</summary>
    private Task LoadAsync()
    {
        return Task.Run(() =>
        {
            try
            {
                var lib = libraryServiceFactory();
                var items = lib.ListAsync().GetAwaiter().GetResult();
                allItems = items;
                ApplyFilter();
                PrefetchCovers();
            }
            catch
            {
                // Swallow to keep TUI stable.
            }
        });
    }

    private void PrefetchCovers()
    {
        if (!Tokens.Tokens.HasBackdrop || Icons.Icons.ForceAscii)
        {
            return;
        }
        CoverArt.Prefetch(allItems.Select(item => (item.CoverImagePath, item.CoverImageUrl)).ToArray());
    }

    /// <summary>Background task spawned by <c>q</c>; exposed for tests.</summary>
    internal Task? PendingEnqueue => enqueueTask;

    /// <summary>
    /// Enqueue the currently-selected items (or the cursor item when no
    /// multi-selection is active) into the persistent queue and switch to
    /// the Queue tab. No-op when no queue service was wired in.
    /// </summary>
    private bool EnqueueSelection()
    {
        if (queueServiceFactory is null)
        {
            return false;
        }

        IReadOnlyList<LibraryItem> targets;
        if (selected.Count > 0)
        {
            var byAsin = filtered.Concat(allItems)
                .GroupBy(i => i.Asin, StringComparer.Ordinal)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);
            targets = selected
                .Where(byAsin.ContainsKey)
                .Select(a => byAsin[a])
                .ToArray();
        }
        else if (cursor >= 0 && cursor < filtered.Count)
        {
            targets = new[] { filtered[cursor] };
        }
        else
        {
            return true;
        }

        if (targets.Count == 0)
        {
            return true;
        }

        var snapshot = targets;
        var nav = navigator;
        enqueueTask = Task.Run(async () =>
        {
            var added = 0;
            var skipped = 0;
            try
            {
                var queue = queueServiceFactory();
                foreach (var item in snapshot)
                {
                    var entry = new QueueEntry
                    {
                        Asin = item.Asin,
                        Title = item.Title,
                    };
                    if (await queue.AddAsync(entry).ConfigureAwait(false))
                    {
                        added++;
                    }
                    else
                    {
                        skipped++;
                    }
                }
            }
            catch (Exception ex)
            {
                nav?.ShowToast($"Enqueue failed: {ex.Message}");
                return;
            }

            var msg = (added, skipped) switch
            {
                (0, 0) => "Nothing to enqueue.",
                (_, 0) => $"Enqueued {added} {Pluralize(added, "title", "titles")}.",
                (0, _) => $"Already in queue ({skipped} skipped).",
                _ => $"Enqueued {added} · {skipped} already in queue.",
            };
            nav?.ShowToast(msg);
            if (added > 0)
            {
                nav?.SwitchToTab('3');
            }
        });

        selected.Clear();
        return true;
    }

    private void ApplyFilter()
    {
        var search = searchInput.Text.Trim();
        if (string.IsNullOrEmpty(search))
        {
            filtered = allItems;
        }
        else
        {
            filtered = allItems
                .Where(i =>
                    i.Title.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                    i.Authors.Any(a => a.Contains(search, StringComparison.OrdinalIgnoreCase)) ||
                    (i.Series?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false))
                .ToArray();
        }
        cursor = Math.Min(cursor, Math.Max(0, filtered.Count - 1));
    }

    private void AdjustScroll(int visibleHeight)
    {
        if (cursor < scrollOffset)
        {
            scrollOffset = cursor;
        }
        else if (cursor >= scrollOffset + visibleHeight)
        {
            scrollOffset = cursor - visibleHeight + 1;
        }
    }

    private static string FormatRuntime(TimeSpan ts)
    {
        if (ts.TotalHours >= 1)
        {
            return $"{(int)ts.TotalHours}h{ts.Minutes:D2}m";
        }
        return $"{ts.Minutes}m";
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..(max - 1)] + "…";

    private static string Pluralize(int n, string singular, string plural) =>
        n == 1 ? singular : plural;
}
