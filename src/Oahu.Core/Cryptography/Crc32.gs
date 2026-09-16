package Oahu.Core.Cryptography

internal class Crc32 {
    shared {
        private const Polynomial uint32 = 3988292384U
        private let Table[]uint32 = [256]uint32

        init {
            var value uint32
            var temp uint32
            for var i uint32 = uint32(0); int64(i) < int64(Table.Length); i++ {
                value = uint32(0)
                temp = i
                for var j uint8 = uint8(0); j < uint8(8); j++ {
                    if ((value ^ temp) & uint32(0x1)) != uint32(0) {
                        value = value >> 1 ^ Polynomial
                    } else {
                        value >>= 1
                    }
                    temp >>= 1
                }
                Table[i] = value
            }
        }

        func ComputeChecksum(bytes[]uint8) uint32 {
            var crc uint32 = uint32(0)
            crc ^= uint32.MaxValue
            for var i = 0; i < bytes.Length; i++ {
                let index = uint8((crc ^ uint32(bytes[i])))
                crc = crc >> 8 ^ Table[index]
            }
            crc ^= uint32.MaxValue
            return crc
        }
    }
}
