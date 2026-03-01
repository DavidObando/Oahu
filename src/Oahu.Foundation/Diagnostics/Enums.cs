using System;
using System.ComponentModel;

namespace Oahu.Aux.Diagnostics
{
  /// <summary>
  /// Flags to control dump output
  /// </summary>
  [Flags]
  public enum EDumpFlags
  {
    None = 0,

    /// <summary>
    /// Add a counter to each item in an enumeration
    /// </summary>
    WithItmCnt = 1,

    /// <summary>
    /// Include properties with <c>null</c> values
    /// </summary>
    InclNullVals = 2,

    /// <summary>
    /// Include property description, <see cref="DescriptionAttribute"/>
    /// </summary>
    InclDesc = 4,

    /// <summary>
    /// Description above property, if included. Behind property by default.
    /// </summary>
    DescOnTop = 8,

    /// <summary>
    /// Include type description, <see cref="DescriptionAttribute"/>
    /// </summary>
    InclTypeDesc = 16,

    /// <summary>
    /// Include description in enumerations
    /// </summary>
    InclDescInEnum = 32,

    /// <summary>
    /// Inherit attributes defined for properities in base interfaces, <see cref="TreeDecomposition{T}"/> for recognized attributes
    /// </summary>
    InherInterfaceAttribs = 64,

    /// <summary>
    /// Group properties by implemented interfaces and their hierarchy
    /// </summary>
    ByInterface = 128,

    /// <summary>
    /// Include grouping by interface for types further down the hierarchy
    /// </summary>
    ByInterfaceNestedTypes = 256,
  }
}
