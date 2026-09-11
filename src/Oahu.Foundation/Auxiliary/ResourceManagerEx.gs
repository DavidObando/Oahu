package Oahu.Aux.Extensions

import System.Resources

func (rm ResourceManager?) GetStringEx(val string) string {
    if rm == nil {
        return val
    }
    var s string? = nil
    try {
        s = rm.GetString(val.ToLowerInvariant())
    } catch (MissingManifestResourceException) { }
    return s ?? val
}
