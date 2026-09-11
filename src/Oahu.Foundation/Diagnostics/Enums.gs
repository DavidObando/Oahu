package Oahu.Aux.Diagnostics

import System
import System.ComponentModel

/// Flags to control dump output
@Flags
enum EDumpFlags {
    None,
    WithItmCnt,
    InclNullVals,
    InclDesc = 4,
    DescOnTop = 8,
    InclTypeDesc = 16,
    InclDescInEnum = 32,
    InherInterfaceAttribs = 64,
    ByInterface = 128,
    ByInterfaceNestedTypes = 256
}
