package Oahu.Core.Cryptography

import System
import System.Text

internal class MetadataEncryptor {
    shared {
        private let AmazonKey[]uint32 = []uint32{4169969034U, 4087877101U, uint32(1706678977), 3681020276U}

        func Encrypt(metadata string) string {
            ArgumentNullException.ThrowIfNull(metadata)
            let metadataBytes = Encoding.ASCII.GetBytes(metadata)
            let crc = Crc32.ComputeChecksum(metadataBytes).ToString("X8")
            let clearString = crc + "#" + metadata
            let clearBytes = Encoding.ASCII.GetBytes(clearString)
            let cipherBytes = XXTEA.Encrypt(clearBytes, AmazonKey)
            return "ECdITeCs:" + Convert.ToBase64String(cipherBytes)
        }
    }
}
