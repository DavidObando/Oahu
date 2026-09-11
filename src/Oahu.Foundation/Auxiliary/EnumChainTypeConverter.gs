package Oahu.Aux

import Oahu.Aux.EnumUtil
import Oahu.Aux.Extensions
import System
import System.Collections.Generic
import System.ComponentModel
import System.Globalization
import System.Linq
import System.Resources

open class EnumChainConverter[TEnum Enum struct, TPunct IChainPunctuation class init()] : TypeConverter {
    // const char USCORE = '_';
    private let values[]TEnum

    // readonly IChainPunctuation _punct;
    private var resourceManager ResourceManager

    private var reverseLookup Dictionary[string, TEnum]?

    init() {
        // _punct = Singleton<TPunct>.Instance;
        values = GetValues[TEnum]().ToArray()
    }

    protected prop ResourceManager ResourceManager {
        get -> resourceManager
        set {
            resourceManager = value
            InitReverseLookup()
        }
    }

    open override func GetStandardValuesSupported(context ITypeDescriptorContext) bool -> true

    open override func GetStandardValuesExclusive(context ITypeDescriptorContext) bool -> true

    open override func GetStandardValues(context ITypeDescriptorContext) TypeConverter.StandardValuesCollection {
        let svc = TypeConverter.StandardValuesCollection(values)
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

    // static readonly byte __a = Convert.ToByte ('a');
    private func ToDisplayString(value TEnum) string -> value.ToDisplayString[TEnum, TPunct](ResourceManager)

    // private string toDisplayString (TEnum value) {
    //  string sval = value.ToString ();
    //  string[] parts = sval.Split (USCORE);
    // bool noSubstitutes = parts.Select (s => s.Length).Min () > 1;
    //  StringBuilder sb = new StringBuilder ();
    //  if (noSubstitutes) {
    //    for (int i = 0; i < parts.Length; i++)
    //      parts[i] = _punct.Prefix + ResourceManager.GetStringEx (parts[i]) + _punct.Suffix;
    //    foreach (string s in parts) {
    //      if (sb.Length > 0)
    //        sb.Append (_punct.Infix?[0]);
    //      sb.Append (s);
    //    }
    //  } else {
    //    for (int i = 0; i < parts.Length; i++) {
    //      if (parts[i].Length > 1)
    //        parts[i] = _punct.Prefix + ResourceManager.GetStringEx (parts[i]) + _punct.Suffix;
    //      else {
    //        byte x = Convert.ToByte (parts[i][0]);
    //        try {
    //          parts[i] = _punct.Infix?[x - __a];
    //        } catch (IndexOutOfRangeException) {
    //          parts[i] = string.Empty;
    //        }
    //      }
    //    }
    //    foreach (string s in parts)
    //      sb.Append (s);
    //  }
    //  return sb.ToString ();
    // }
    private func InitReverseLookup() {
        reverseLookup = Dictionary[string, TEnum]()
        for v in values {
            InitReverseLookup(v)
        }
    }

    private func InitReverseLookup(value TEnum) -> reverseLookup!!.Add(ToDisplayString(value), value)
}
