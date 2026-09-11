package Oahu.Aux.Diagnostics

import System
import System.Collections.Generic

/// Base class to implement (cref:IPrimitiveTypes) with a dictionary.
/// Derived classes simply need to call the provided add method with custom function delegates.
/// @seealso Oahu.Aux.Diagnostics.IPrimitiveTypes
open class AbstractPrimitiveTypes : IPrimitiveTypes {
    private var dict Dictionary[Type, Delegate] = Dictionary[Type, Delegate]()

    /// Determines whether the specified generic type is regarded as a custom primitive type.
    /// @typeparam T generic type
    func IsPrimitiveType[T]() bool {
        let type = typeof(T)
        return IsPrimitiveType(type)
    }

    /// Determines whether the specified type is regarded as a custom primitive type.
    /// @param type The type to be checked.
    func IsPrimitiveType(type Type?) bool -> dict.ContainsKey(type!!)

    /// Returns a (cref:System.String) that represents this instance,
    /// if registered as a custom primitive type. Type-safe variant.
    /// @typeparam T generic type
    /// @param val The value.
    /// @returns A (cref:System.String) that represents this instance or `null`.
    func ToString[T](val T) string? -> ToStringFunc[T]()?(val)

    /// Returns a (cref:System.String) that represents this instance,
    /// if registered as a custom primitive type. Type deduction variant.
    /// @param val The value.
    /// @returns A (cref:System.String) that represents this instance or `null`.
    func ToString(val object?) string? {
        if val == nil {
            return string.Empty
        }
        let type = val.GetType()
        let d Delegate? = ToStringFunc(type)
        return d?.Method.Invoke(d!!.Target, []object{val}) as string
    }

    /// Returns a (cref:System.String) that represents this instance,
    /// if registered as a custom primitive type. Non-type-safe variant.
    /// @typeparam T generic type
    /// @param val The value.
    /// @returns A (cref:System.String) that represents this instance.
    func ToString[T](val object?) string? {
        let type = typeof(T)
        let d Delegate? = ToStringFunc(type)
        return d?.Method.Invoke(d!!.Target, []object{val!!}) as string
    }

    /// Sets the specified function for the given type.
    /// @typeparam T generic type
    /// @param func_ The function delegate.
    protected func Add[T](func_(T) -> string) {
        let type = typeof(T)
        dict[type] = func_
    }

    /// Function delegate for generic type a custom primitive type to obtain string representation.
    /// Type-safe variant.
    /// @typeparam T generic type
    /// @returns Function delegate for generic type {T} or `null`.
    private func ToStringFunc[T]()((T) -> string)? {
        let type = typeof(T)
        let succ = dict.TryGetValue(type, out var func_)
        if succ {
            return func_ as (T) -> string
        } else {
            return nil
        }
    }

    /// Function delegate for type to obtain string representation. Non-type-safe variant.
    /// @returns Generic delegate for type or `null`.
    private func ToStringFunc(type Type) Delegate? {
        let succ = dict.TryGetValue(type, out var func_)
        if succ {
            return func_
        } else {
            return nil
        }
    }
}

/// Convenience class as default implementation of (cref:IPrimitiveTypes) with no additional custom
/// types.
/// @seealso Oahu.Aux.Diagnostics.AbstractPrimitiveTypes
internal class NoPrimitiveTypes : AbstractPrimitiveTypes { }
