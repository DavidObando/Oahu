package Oahu.Aux.Diagnostics

import System
import System.Collections.Generic
import System.Diagnostics.CodeAnalysis

/// An attribute intended to be used as a custom format string in text serialization.
/// @seealso System.Attribute
@AttributeUsage(AttributeTargets.Property)
class TextFormatAttribute : Attribute {
    let Format string

    init(format string) {
        Format = format
    }
}

/// An attribute intended to convey a custom ToString() method.
/// Given type must be derived from (cref:ToStringConverter).
/// Optional second parameter to be interpreted as a format specification.
/// @seealso System.Attribute
@AttributeUsage(AttributeTargets.Property)
class ToStringAttribute : Attribute {
    let Converter ToStringConverter?
    let Format string?

    init(
        @DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicParameterlessConstructor) type Type,
        format string? = nil
    ) {
        if typeof(ToStringConverter).IsAssignableFrom(type) {
            lock Converters {
                let succ = Converters.TryGetValue(type, out var converter)
                if succ {
                    Converter = converter
                } else {
                    try {
                        Converter = cast[ToStringConverter](Activator.CreateInstance(type))
                        Converters.Add(type, Converter!!)
                    } catch (Exception) { }
                }
            }
        }
        Format = format
    }

    shared {
        private let Converters Dictionary[Type, ToStringConverter] = Dictionary[Type, ToStringConverter]()
    }
}

/// An attribute similar to (cref:System.ComponentModel.DisplayNameAttribute),
/// but intended to be used with collection items.
/// @seealso System.Attribute
@AttributeUsage(AttributeTargets.Property)
class DisplayItemNameAttribute : Attribute {
    let Name string

    init(name string) {
        Name = name
    }
}
