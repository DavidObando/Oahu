using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;

namespace Oahu.Decrypt.Mpeg4;

public record ChapterInfo : IEnumerable<Chapter>
{
  private readonly List<Chapter> chapterList = new();

  public ChapterInfo(TimeSpan offsetFromBeginning = default) => StartOffset = offsetFromBeginning;

  public TimeSpan StartOffset { get; }

  public TimeSpan EndOffset => Count == 0 ? StartOffset : chapterList.Max(c => c.EndOffset);

  public IReadOnlyList<Chapter> Chapters => chapterList;

  public int Count => chapterList.Count;

  public int RenderSize => chapterList.Sum(c => c.RenderSize);

  public void AddChapter(string title, TimeSpan duration)
  {
    TimeSpan startTime = Count == 0 ? StartOffset : chapterList[^1].EndOffset;

    chapterList.Add(new Chapter(title, startTime, duration));
  }

  public void Add(string title, TimeSpan duration) => AddChapter(title, duration);

  public IEnumerator<Chapter> GetEnumerator()
  {
    return chapterList.GetEnumerator();
  }

  IEnumerator IEnumerable.GetEnumerator()
  {
    return GetEnumerator();
  }
}
