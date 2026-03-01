using System.Collections.Generic;
using Oahu.CommonTypes;

namespace Oahu.Core
{
  interface ILocale
  {
    ERegion CountryCode { get; }

    string Domain { get; }

    string MarketPlaceId { get; }
  }

  record LocaleTemplate(ERegion CountryCode, string Domain, string MarketPlaceId) : ILocale
  {
  }

  static class Locale
  {
    static readonly Dictionary<ERegion, LocaleTemplate> LocaleTemplates = new()
    {
      { ERegion.De, new(ERegion.De, "de", "AN7V1F1VY261K") },
      { ERegion.Us, new(ERegion.Us, "com", "AF2M0KC94RCEA") },
      { ERegion.Uk, new(ERegion.Uk, "co.uk", "A2I9A3Q2GNFNGQ") },
      { ERegion.Fr, new(ERegion.Fr, "fr", "A2728XDNODOQ8T") },
      { ERegion.Ca, new(ERegion.Ca, "ca", "A2CQZ5RBY40XE") },
      { ERegion.It, new(ERegion.It, "it", "A2N7FU2W2BU2ZC") },
      { ERegion.Au, new(ERegion.Au, "com.au", "AN7EY7DTAW63G") },
      { ERegion.@In, new(ERegion.@In, "in", "AJO3FBRUE6J4S") },
      { ERegion.Jp, new(ERegion.Jp, "co.jp", "A1QAP3MOU4173J") },
      { ERegion.Es, new(ERegion.Es, "es", "ALMIKO4SZCSAR") },
      { ERegion.Br, new(ERegion.Br, "com.br", "A10J1VAYUDTYRN") },
    };

    public static ILocale FromCountryCode(this ERegion countryCode)
    {
      bool succ = LocaleTemplates.TryGetValue(countryCode, out var locale);
      if (!succ)
      {
        return null;
      }

      return locale;
    }
  }
}
