package Oahu.Common.Util

import Oahu.Aux.Diagnostics
import Oahu.Aux.Extensions
import System

class ToStringConverterActivationCode : ToStringConverter {
    override func ToString(o object?, format string? = nil) string? {
        try {
            let ac = uint32?(o)
            return if (ac != nil) {
                "XXXXXXXX"
            } else {
                default(string?)
            }
        } catch (Exception) {
            return nil
        }
    }
}

class ToStringConverterPath : ToStringConverter {
    override func ToString(o object?, format string? = nil) string? {
        if o is string s {
            return s.SubstitUser()
        } else {
            return nil
        }
    }
}
