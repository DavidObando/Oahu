using System;
using Oahu.CommonTypes;

namespace Oahu.BooksDatabase
{
  namespace Ex
  {
    public static class ExCodec
    {
      public static bool TryParseCodec(string format, out ECodec codec)
      {
        if (format is null)
        {
          codec = default;
          return false;
        }

        // Handle API format with underscores (e.g., "aax_22_32")
        string normalized = format.Replace("_", string.Empty);
        return Enum.TryParse(normalized, true, out codec);
      }

      public static AudioQuality ToQuality(this Codec codec) => codec.Name.ToQuality();

      public static AudioQuality ToQuality(this ECodec codec)
      {
        return codec switch
        {
          ECodec.Aax2232 => new AudioQuality(22050, 32),
          ECodec.Aax2264 => new AudioQuality(22050, 64),
          ECodec.Aax4464 => new AudioQuality(44100, 64),
          ECodec.Aax44128 => new AudioQuality(44100, 128),
          _ => default,
        };
      }
    }
  }

  public record AudioQuality(int? SampleRate, int? BitRate) : IAudioQuality;
}
