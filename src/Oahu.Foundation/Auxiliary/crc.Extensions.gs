package Oahu.Aux.Extensions

import Oahu.Aux
import System
import System.Collections.Generic
import System.Security.Cryptography

func (bytes[]uint8) Checksum32() uint32 {
    return Crc32.Compute(bytes)
}

func (text string) Checksum32() uint32 -> text.GetBytes().Checksum32()
