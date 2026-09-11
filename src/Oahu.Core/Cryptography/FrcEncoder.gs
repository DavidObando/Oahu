package Oahu.Core.Cryptography

import System
import System.IO
import System.IO.Compression
import System.Security.Cryptography
import System.Text

internal class FrcEncoder {
    shared {
        func Encode(deviceSn string, json string) string {
            let compressed = GzipCompress(Encoding.UTF8.GetBytes(json))
            let key = deviceSn.AsSpan()
            let iv ReadOnlySpan[uint8] = RandomNumberGenerator.GetBytes(16)
            let encrypted = EncryptFrc(key, iv, compressed)
            let sig = ComputeSig(key, iv, encrypted)
            let bytes = [1 + sig.Length + iv.Length + encrypted.Length]uint8
            sig.CopyTo(bytes.AsSpan(1))
            iv.CopyTo(bytes.AsSpan(1 + sig.Length))
            encrypted.CopyTo(bytes.AsSpan(1 + sig.Length + iv.Length))
            return Convert.ToBase64String(bytes)
        }

        private func GzipCompress(data[]uint8)[]uint8 {
            using let ms = MemoryStream()
            {
                using let gzip = GZipStream(ms, CompressionLevel.SmallestSize)
                gzip.Write(data)
            }
            return ms.ToArray()
        }

        private func EncryptFrc(deviceSn ReadOnlySpan[char], iv ReadOnlySpan[uint8], data ReadOnlySpan[uint8])[]uint8 {
            using let aes = GetAes(deviceSn)
            return aes.EncryptCbc(data, iv, PaddingMode.PKCS7)
        }

        private func ComputeSig(deviceSn ReadOnlySpan[char], iv ReadOnlySpan[uint8], data ReadOnlySpan[uint8])[]uint8 {
            let key = GetKeyFromPassword(deviceSn, []uint8{0x48, 0x6D, 0x61, 0x63, 0x53, 0x48, 0x41, 0x32, 0x35, 0x36})
            using let hmac = HMACSHA256(key)
            let bytes = [iv.Length + data.Length]uint8
            iv.CopyTo(bytes)
            data.CopyTo(bytes.AsSpan(iv.Length))
            return hmac.ComputeHash(bytes)[.. 8]
        }

        private func GetAes(deviceSn ReadOnlySpan[char]) Aes {
            let aes = Aes.Create()
            aes.Key = GetKeyFromPassword(
                deviceSn,
                []uint8{
                    0x41,
                    0x45,
                    0x53,
                    0x2F,
                    0x43,
                    0x42,
                    0x43,
                    0x2F,
                    0x50,
                    0x4B,
                    0x43,
                    0x53,
                    0x37,
                    0x50,
                    0x61,
                    0x64,
                    0x64,
                    0x69,
                    0x6E,
                    0x67
                }
            )
            return aes
        }

        private func GetKeyFromPassword(
            deviceSn ReadOnlySpan[char],
            salt ReadOnlySpan[uint8]
        )[]uint8 -> Rfc2898DeriveBytes.Pbkdf2(deviceSn, salt, 1000, HashAlgorithmName.SHA1, 16)
    }
}
