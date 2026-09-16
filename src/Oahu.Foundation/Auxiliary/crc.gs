package Oahu.Aux

import System
import System.Collections.Generic
import System.Security.Cryptography

/// Implements a 32-bit CRC hash algorithm compatible with Zip etc.
/// https://github.com/damieng/DamienGKit/tree/master/CSharp/DamienG.Library/Security/Cryptography
/// @remarks Crc32 should only be used for backward compatibility with older file formats
/// and algorithms. It is not secure enough for new applications.
/// If you need to call multiple times for the same data either use the HashAlgorithm
/// interface or remember that the result of one Compute call needs to be ~ (XOR) before
/// being passed in as the seed for the next Compute call.
open class Crc32 : HashAlgorithm {
    private let seed uint32
    private let table[]?uint32
    private var hash uint32

    convenience init() {
        init(DefaultPolynomial, DefaultSeed)
    }

    init(polynomial uint32, seed uint32) {
        if !BitConverter.IsLittleEndian {
            throw PlatformNotSupportedException("Not supported on Big Endian processors")
        }
        table = InitializeTable(polynomial)
        this.seed = (hash = seed)
    }

    open override prop HashSize int32 {
        get {
            return 32
        }
    }

    open override func Initialize() {
        hash = seed
    }

    protected open override func HashCore(array[]uint8, ibStart int32, cbSize int32) {
        hash = CalculateHash(table, hash, array, ibStart, cbSize)
    }

    protected open override func HashFinal()[]uint8 {
        let hashBuffer = UInt32ToBigEndianBytes(^hash)
        HashValue = hashBuffer
        return hashBuffer
    }

    shared {
        const DefaultPolynomial uint32 = 0xedb88320u
        const DefaultSeed uint32 = 0xffffffffu
        private var defaultTable[]?uint32

        func Compute(buffer[]uint8) uint32 {
            return Compute(DefaultSeed, buffer)
        }

        func Compute(seed uint32, buffer[]uint8) uint32 {
            return Compute(DefaultPolynomial, seed, buffer)
        }

        func Compute(polynomial uint32, seed uint32, buffer[]uint8) uint32 {
            return ^CalculateHash(InitializeTable(polynomial), seed, buffer, 0, buffer.Length)
        }

        private func InitializeTable(polynomial uint32)[]?uint32 {
            if polynomial == DefaultPolynomial && defaultTable != nil {
                return defaultTable
            }
            let createTable = [256]uint32
            for var i = 0; i < 256; i++ {
                var entry = uint32(i)
                for var j = 0; j < 8; j++ {
                    if (entry & uint32(1)) == uint32(1) {
                        entry = (entry >> 1) ^ polynomial
                    } else {
                        entry >>= 1
                    }
                }
                createTable[i] = entry
            }
            if polynomial == DefaultPolynomial {
                defaultTable = createTable
            }
            return createTable
        }

        private func CalculateHash(table[]?uint32, seed uint32, buffer IList[uint8], start int32, size int32) uint32 {
            var hash = seed
            for var i = start; i < start + size; i++ {
                hash = (hash >> 8) ^ table!![uint32(buffer[i]) ^ hash & uint32(0xff)]
            }
            return hash
        }

        private func UInt32ToBigEndianBytes(uint32 uint32)[]uint8 {
            let result = BitConverter.GetBytes(uint32)
            if BitConverter.IsLittleEndian {
                Array.Reverse(result)
            }
            return result
        }
    }
}

/// Implements a 64-bit CRC hash algorithm for a given polynomial.
/// https://github.com/damieng/DamienGKit/tree/master/CSharp/DamienG.Library/Security/Cryptography
/// @remarks For ISO 3309 compliant 64-bit CRC's use Crc64Iso.
open class Crc64 : HashAlgorithm {
    private let table[]?uint64
    private let seed uint64
    private var hash uint64

    convenience init(polynomial uint64) {
        init(polynomial, DefaultSeed)
    }

    init(polynomial uint64, seed uint64) {
        if !BitConverter.IsLittleEndian {
            throw PlatformNotSupportedException("Not supported on Big Endian processors")
        }
        table = InitializeTable(polynomial)
        this.seed = (hash = seed)
    }

    open override prop HashSize int32 {
        get {
            return 64
        }
    }

    open override func Initialize() {
        hash = seed
    }

    protected open override func HashCore(array[]uint8, ibStart int32, cbSize int32) {
        hash = CalculateHash(hash, table, array, ibStart, cbSize)
    }

    protected open override func HashFinal()[]uint8 {
        let hashBuffer = UInt64ToBigEndianBytes(hash)
        HashValue = hashBuffer
        return hashBuffer
    }

    shared {
        const DefaultSeed uint64 = uint64(0x0)

        protected func CalculateHash(seed uint64, table[]?uint64, buffer IList[uint8], start int32, size int32) uint64 {
            var hash = seed
            for var i = start; i < start + size; i++ {
                unchecked {
                    hash = (hash >> 8) ^ table!![(uint64(buffer[i]) ^ hash) & uint64(0xff)]
                }
            }
            return hash
        }

        protected func CreateTable(polynomial uint64)[]uint64 {
            let createTable = [256]uint64
            for var i = 0; i < 256; i++ {
                var entry = uint64(i)
                for var j = 0; j < 8; j++ {
                    if (entry & uint64(1)) == uint64(1) {
                        entry = (entry >> 1) ^ polynomial
                    } else {
                        entry >>= 1
                    }
                }
                createTable[i] = entry
            }
            return createTable
        }

        private func UInt64ToBigEndianBytes(value uint64)[]uint8 {
            let result = BitConverter.GetBytes(value)
            if BitConverter.IsLittleEndian {
                Array.Reverse(result)
            }
            return result
        }

        private func InitializeTable(polynomial uint64)[]?uint64 {
            if polynomial == Crc64Iso.Iso3309Polynomial && Crc64Iso.Table != nil {
                return Crc64Iso.Table
            }
            let createTable = CreateTable(polynomial)
            if polynomial == Crc64Iso.Iso3309Polynomial {
                Crc64Iso.Table = createTable
            }
            return createTable
        }
    }
}

class Crc64Iso : Crc64 {
    init() : base(Iso3309Polynomial) { }

    init(seed uint64) : base(Iso3309Polynomial, seed) { }

    shared {
        const Iso3309Polynomial uint64 = 0xD800000000000000UL
        internal var Table[]?uint64

        func Compute(buffer[]uint8) uint64 {
            return Compute(Crc64.DefaultSeed, buffer)
        }

        func Compute(seed uint64, buffer[]uint8) uint64 {
            if Table == nil {
                Table = Crc64.CreateTable(Iso3309Polynomial)
            }
            return Crc64.CalculateHash(seed, Table, buffer, 0, buffer.Length)
        }
    }
}
