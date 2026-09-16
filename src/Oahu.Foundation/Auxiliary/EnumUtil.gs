package Oahu.Aux

import Oahu.Aux.Extensions
import System
import System.Collections.Generic
import System.Linq
import System.Resources
import System.Text

class EnumUtil {
    shared {
        const USCORE char = '_'
        let ByteA uint8 = Convert.ToByte('a')

        // Note: constraint System.Enum available in C# 7.3
        func GetValues[T Enum struct]() IEnumerable[T] {
            let values = Enum.GetValues(typeof(T))
            return values.Cast[T]().ToList()
        }

        // Note: constraint System.Enum available in C# 7.3
        func GetStringValues[T Enum struct]()[]string {
            let values = GetValues[T]()
            return values.Select((v T) -> "<$v>").ToArray()
        }
    }
}

func (value TEnum) ToDisplayString[TEnum Enum struct, TPunct IChainPunctuation class init()](
    rm ResourceManager
) string {
    let punct TPunct? = Singleton[TPunct].Instance
    let sval = value.ToString()
    // verbatim ?
    if sval.StartsWith("_") {
        return rm.GetStringEx(sval.Substring(1))
    }
    let parts = sval.Split(EnumUtil.USCORE)
    let noSubstitutes = parts.Select((s string) -> s.Length).Min() > 1
    let sb = StringBuilder()
    if noSubstitutes {
        for var i = 0; i < parts.Length; i++ {
            parts[i] = (punct!!.Prefix + rm.GetStringEx(parts[i]) + punct!!.Suffix)
        }
        for s in parts {
            if sb.Length > 0 {
                sb.Append(punct!!.Infix?[0])
            }
            sb.Append(s)
        }
    } else {
        for var i = 0; i < parts.Length; i++ {
            if parts[i].Length > 1 {
                parts[i] = (punct!!.Prefix + rm.GetStringEx(parts[i]) + punct!!.Suffix)
            } else {
                let x = Convert.ToByte(parts[i][0])
                try {
                    parts[i] = punct!!.Infix?[x - EnumUtil.ByteA]!!
                } catch (IndexOutOfRangeException) {
                    parts[i] = string.Empty
                }
            }
        }
        for s in parts {
            sb.Append(s)
        }
    }
    return sb.ToString()
}
