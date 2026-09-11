package Oahu.Core

import Oahu.CommonTypes
import System.Collections.Generic

internal interface ILocale {
    prop CountryCode ERegion {
        get;
    }

    prop Domain string {
        get;
    }

    prop MarketPlaceId string {
        get;
    }
}

internal open data class LocaleTemplate(CountryCode ERegion, Domain string, MarketPlaceId string) : ILocale { }

internal class Locale {
    shared {
        let LocaleTemplates Dictionary[ERegion, LocaleTemplate] = Dictionary[ERegion, LocaleTemplate]{
            ERegion.De: LocaleTemplate(ERegion.De, "de", "AN7V1F1VY261K"),
            ERegion.Us: LocaleTemplate(ERegion.Us, "com", "AF2M0KC94RCEA"),
            ERegion.Uk: LocaleTemplate(ERegion.Uk, "co.uk", "A2I9A3Q2GNFNGQ"),
            ERegion.Fr: LocaleTemplate(ERegion.Fr, "fr", "A2728XDNODOQ8T"),
            ERegion.Ca: LocaleTemplate(ERegion.Ca, "ca", "A2CQZ5RBY40XE"),
            ERegion.It: LocaleTemplate(ERegion.It, "it", "A2N7FU2W2BU2ZC"),
            ERegion.Au: LocaleTemplate(ERegion.Au, "com.au", "AN7EY7DTAW63G"),
            ERegion.In: LocaleTemplate(ERegion.In, "in", "AJO3FBRUE6J4S"),
            ERegion.Jp: LocaleTemplate(ERegion.Jp, "co.jp", "A1QAP3MOU4173J"),
            ERegion.Es: LocaleTemplate(ERegion.Es, "es", "ALMIKO4SZCSAR"),
            ERegion.Br: LocaleTemplate(ERegion.Br, "com.br", "A10J1VAYUDTYRN")
        }
    }
}

func extension(countryCode ERegion) FromCountryCode() ILocale? {
    let succ = Locale.LocaleTemplates.TryGetValue(countryCode, out var locale)
    if !succ {
        return nil
    }
    return locale
}
