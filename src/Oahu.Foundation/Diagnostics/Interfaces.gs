package Oahu.Aux.Diagnostics

import System

/// Interface for custom primitive types, to be used with (cref:TreeDecomposition{T})
interface IPrimitiveTypes {
    /// Determines whether the specified generic type is regarded as a custom primitive type.
    /// @typeparam T generic type
    func IsPrimitiveType[T]() bool;

    /// Determines whether the specified type is regarded as a custom primitive type.
    /// @param type The type to be checked.
    func IsPrimitiveType(type Type?) bool;

    /// Returns a (cref:System.String) that represents this instance,
    /// if registered as a custom primitive type. Type-safe variant.
    /// @typeparam T generic type
    /// @param val The value.
    /// @returns A (cref:System.String) that represents this instance or `null`.
    func ToString[T](val T) string?;

    /// Returns a (cref:System.String) that represents this instance,
    /// if registered as a custom primitive type. Type deduction variant.
    /// @param val The value.
    /// @returns A (cref:System.String) that represents this instance or `null`.
    func ToString(val object?) string?;

    /// Returns a (cref:System.String) that represents this instance,
    /// if registered as a custom primitive type. Non-type-safe variant.
    /// @typeparam T generic type
    /// @param val The value.
    /// @returns A (cref:System.String) that represents this instance.
    func ToString[T](val object?) string?;
}
