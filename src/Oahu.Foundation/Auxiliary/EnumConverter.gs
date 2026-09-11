package Oahu.Aux

import Oahu.Aux.EnumUtil
import Oahu.Aux.Extensions
import System
import System.Collections.Generic
import System.ComponentModel
import System.Globalization
import System.Linq
import System.Resources

open class EnumConverter[TEnum Enum struct] : TypeConverter {
    private var resourceManager ResourceManager
    private var reverseLookup Dictionary[string, TEnum]?

    init() {
        Values = GetValues[TEnum]().ToArray()
    }

    protected prop Values IList[TEnum] {
        get;
        init;
    }

    protected prop ResourceManager ResourceManager {
        get -> resourceManager
        set {
            resourceManager = value
            InitReverseLookup()
        }
    }

    open override func GetStandardValuesSupported(context ITypeDescriptorContext) bool -> true

    open override func GetStandardValues(context ITypeDescriptorContext) TypeConverter.StandardValuesCollection {
        let svc = TypeConverter.StandardValuesCollection(Values.ToArray())
        return svc
    }

    open override func CanConvertTo(context ITypeDescriptorContext, destinationType Type) bool {
        if destinationType != typeof(string) {
            return base.CanConvertTo(context, destinationType)
        } else {
            return true
        }
    }

    open override func CanConvertFrom(context ITypeDescriptorContext, sourceType Type) bool {
        if sourceType != typeof(string) {
            return base.CanConvertFrom(context, sourceType)
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
            case enm is TEnum {
                return ToDisplayString(enm)
            }
        }
    }

    open override func ConvertFrom(context ITypeDescriptorContext, culture CultureInfo, value object) object? {
        if !(reverseLookup == nil) {
            if value is string s {
                let succ = reverseLookup!!.TryGetValue(s, out var e)
                if succ {
                    return e
                }
            }
        }
        return base.ConvertFrom(context, culture, value)
    }

    private func ToDisplayString(value TEnum) string -> ResourceManager.GetStringEx(value.ToString())

    private func InitReverseLookup() {
        reverseLookup = Dictionary[string, TEnum]()
        for v in Values {
            reverseLookup!!.Add(ToDisplayString(v), v)
        }
    }
}
