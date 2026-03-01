using System.Linq;

namespace Oahu.Decrypt.Mpeg4.Boxes.AC4SpecificBox;

public static class Ac4Extensions
{
  static readonly byte[] NumChannelsPerGroup = [2, 1, 2, 2, 2, 2, 1, 2, 2, 1, 1, 1, 1, 2, 1, 1, 2, 2, 2];

  public static int? SampleRate(this Ac4DsiV1? ac4DsiV1) =>
      ac4DsiV1 is null ? null
      : ac4DsiV1.FsIndex == 0 ? 44100
      : 48000;

  public static uint? AverageBitrate(this Ac4DsiV1? ac4DsiV1)
  {
    if (ac4DsiV1 is null)
    {
      return null;
    }

    if (ac4DsiV1.Ac4BitrateDsi.BitRate != 0)
    {
      return ac4DsiV1.Ac4BitrateDsi.BitRate;
    }

    foreach (var presentation in ac4DsiV1.Presentations.OfType<Ac4PresentationV1Dsi>().Where(p => p.BPresentationBitrateInfo))
    {
      if (presentation.Ac4BitrateDsi is Ac4BitrateDsi btrt && btrt.BitRate != 0)
      {
        return btrt.BitRate;
      }
    }

    return null;
  }

  public static ChannelGroups? Channels(this Ac4DsiV1? ac4DsiV1)
  {
    if (ac4DsiV1 is null)
    {
      return null;
    }

    foreach (var presentation in ac4DsiV1
            .Presentations
            .OfType<Ac4PresentationV1Dsi>()
            .OrderByDescending(p => p.PresentationVersion))
    {
      if (presentation.BPresentationChannelCoded is true)
      {
        return presentation.PresentationChannelMaskV1;
      }
      else if (presentation.Substream?.BChannelCoded is true)
      {
        return presentation.Substream.Substreams[0].DsiSubstreamChannelMask;
      }
    }

    return null;
  }

  public static int ChannelCount(this ChannelGroups channels)
  {
    int channelCount = 0;
    for (int g = 0; g <= 18; g++)
    {
      var group = (ChannelGroups)(1 << g);
      if (channels.HasFlag(group))
      {
        channelCount += NumChannelsPerGroup[g];
      }
    }

    return channelCount;
  }
}
