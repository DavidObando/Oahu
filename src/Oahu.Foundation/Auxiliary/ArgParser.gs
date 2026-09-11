package Oahu.Aux

import System
import System.Globalization
import System.Linq
import System.Text

open class ArgParser {
    private let args[]?string
    private let ignoreCase bool

    init(args[]string) {
        this.args = args
    }

    init(args[]string, ignoreCase bool) {
        this.args = args
        this.ignoreCase = ignoreCase
    }

    func Log() {
        for arg in args!! {
            Logging.Log(1, arg)
        }
    }

    open func Exists(tag string) bool {
        if args == nil {
            return false
        }
        let key = "-" + tag
        for arg in args!! {
            if arg.StartsWith(key, ignoreCase, CultureInfo.InvariantCulture) {
                return true
            }
        }
        return false
    }

    open func FindArg(tag string) string? {
        var erg string? = nil
        if args == nil {
            return erg
        }
        let key = "-" + tag + "="
        for arg in args!! {
            if arg.StartsWith(key, ignoreCase, CultureInfo.InvariantCulture) {
                if arg.Length > key.Length {
                    erg = arg.Substring(key.Length, arg.Length - key.Length)
                    break
                }
            }
        }
        return erg
    }

    open func HasArg(tag string) bool {
        if args == nil {
            return false
        }
        let key = "-" + tag
        return args!!.Where((x string) -> x.StartsWith(key, StringComparison.InvariantCultureIgnoreCase)).Any()
    }

    func FindArg(tag string, defaultArgVal string) string? {
        let arg string? = FindArg(tag)
        if arg == nil || arg.Length == 0 {
            return defaultArgVal
        } else {
            return arg
        }
    }

    func FindBooleanArg(tag string) bool? {
        let arg string? = FindArg(tag)
        if arg == nil || arg.Length == 0 {
            return nil
        }
        let value = string.Equals(arg, "true", StringComparison.InvariantCultureIgnoreCase) || arg == "1"
        return value
    }

    func FindBooleanArg(tag string, defaultArgVal bool) bool {
        let arg = FindBooleanArg(tag)
        if arg == nil {
            return defaultArgVal
        } else {
            return arg
        }
    }

    func FindIntArg(tag string) int32? {
        let arg string? = FindArg(tag)
        if arg == nil || arg.Length == 0 {
            return nil
        }
        if !int32.TryParse(arg, out var result) {
            return nil
        }
        return result
    }

    func FindIntArg(tag string, defaultArgVal int32) int32 {
        let arg = FindIntArg(tag)
        if arg == nil {
            return defaultArgVal
        } else {
            return arg
        }
    }

    func FindUIntArg(tag string) uint32? {
        let arg string? = FindArg(tag)
        if arg == nil || arg.Length == 0 {
            return nil
        }
        if !uint32.TryParse(arg, out var result) {
            return nil
        }
        return result
    }

    func FindUIntArg(tag string, defaultArgVal uint32) uint32 {
        let arg = FindUIntArg(tag)
        if arg == nil {
            return defaultArgVal
        } else {
            return arg
        }
    }

    func FindFloatArg(tag string) float64? {
        let arg string? = FindArg(tag)
        if arg == nil || arg.Length == 0 {
            return nil
        }
        if !float64.TryParse(arg, out var result) {
            return nil
        }
        return result
    }

    func FindFloatArg(tag string, defaultArgVal float64) float64 {
        let arg = FindFloatArg(tag)
        if arg == nil {
            return defaultArgVal
        } else {
            return arg
        }
    }

    func FindEnumArg[TEnum Enum struct](tag string) TEnum? {
        let arg string? = FindArg(tag)
        if arg == nil || arg.Length == 0 {
            return nil
        }
        if !Enum.TryParse[TEnum](arg, out var result) {
            return nil
        }
        return result
    }

    func FindEnumArg[TEnum Enum struct](tag string, defaultArgVal TEnum) TEnum {
        let arg = FindEnumArg[TEnum](tag)
        if arg == nil {
            return defaultArgVal
        } else {
            return arg
        }
    }
}
