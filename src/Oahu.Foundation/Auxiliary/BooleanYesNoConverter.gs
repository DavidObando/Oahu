package Oahu.Aux

import Oahu.Aux.Extensions
import System
import System.Collections.Generic
import System.ComponentModel
import System.Globalization
import System.Resources

open class BooleanYesNoConverter : BooleanConverter {
    private var resourceManager ResourceManager
    private var reverseLookup Dictionary[string, bool]?

    protected prop ResourceManager ResourceManager {
        get -> resourceManager
        set {
            resourceManager = value
            InitReverseLookup()
        }
    }

    open override func CanConvertTo(context ITypeDescriptorContext, destinationType Type) bool {
        if destinationType != typeof(string) {
            return base.CanConvertTo(context, destinationType)
        } else {
            return true
        }
    }

    open override func ConvertTo(
        context ITypeDescriptorContext,
        culture CultureInfo,
        value object,
        destinationType Type
    ) object? {
        switch value {
            default {
                return base.ConvertTo(context, culture, value, destinationType)
            }
            case val is bool {
                return ToDisplayString(val)
            }
        }
    }

    open override func ConvertFrom(context ITypeDescriptorContext, culture CultureInfo, value object) object? {
        if !(reverseLookup == nil) {
            if value is string s {
                let succ = reverseLookup!!.TryGetValue(s, out var b)
                if succ {
                    return b
                }
            }
        }
        return base.ConvertFrom(context, culture, value)
    }

    private func ToDisplayString(value bool) string {
        let s = if value {
            TRUE
        } else {
            FALSE
        }
        return ResourceManager.GetStringEx(s)
    }

    private func InitReverseLookup() {
        reverseLookup = Dictionary[string, bool]()
        InitReverseLookup(false)
        InitReverseLookup(true)
    }

    private func InitReverseLookup(value bool) -> reverseLookup!!.Add(ToDisplayString(value), value)

    shared {
        private const TRUE string = "Yes"
        private const FALSE string = "No"
    }
}
