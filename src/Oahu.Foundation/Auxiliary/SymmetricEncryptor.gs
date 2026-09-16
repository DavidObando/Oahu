package Oahu.Aux

import System
import System.Linq
import System.Security.Cryptography
import System.Text

// https://tomrucki.com/posts/aes-encryption-in-csharp/
// possibly way over the top for some applications.
class SymmetricEncryptor {
    shared {
        private const AesBlockByteSize int32 = 128 / 8
        private const PasswordSaltByteSize int32 = 128 / 8
        private const PasswordByteSize int32 = 256 / 8
        private const PasswordIterationCount int32 = 100_000
        private const SignatureByteSize int32 = 256 / 8
        private const MinimumEncryptedMessageByteSize int32 = PasswordSaltByteSize +
            PasswordSaltByteSize +
            AesBlockByteSize +
            AesBlockByteSize +
            SignatureByteSize
        private let StringEncoding Encoding = Encoding.UTF8
        private let Random RandomNumberGenerator = RandomNumberGenerator.Create()

        func EncryptString(toEncrypt string, password string)[]uint8 {
            {
                using let aes = Aes.Create()
                // encrypt
                let keySalt = GenerateRandomBytes(PasswordSaltByteSize)
                let key = GetKey(password, keySalt)
                let iv = GenerateRandomBytes(AesBlockByteSize)
                var cipherText[]uint8
                {
                    using let encryptor = aes.CreateEncryptor(key, iv)
                    let plainText = StringEncoding.GetBytes(toEncrypt)
                    cipherText = encryptor.TransformFinalBlock(plainText, 0, plainText.Length)
                }
                // sign
                let authKeySalt = GenerateRandomBytes(PasswordSaltByteSize)
                let authKey = GetKey(password, authKeySalt)
                let result = MergeArrays(additionalCapacity: SignatureByteSize, authKeySalt, keySalt, iv, cipherText)
                {
                    using let hmac = HMACSHA256(authKey)
                    let payloadToSignLength = result.Length - SignatureByteSize
                    let signatureTag = hmac.ComputeHash(result, 0, payloadToSignLength)
                    signatureTag.CopyTo(result, payloadToSignLength)
                }
                return result
            }
        }

        func DecryptToString(encryptedData[]?uint8, password string) string {
            if encryptedData == nil || encryptedData.Length < MinimumEncryptedMessageByteSize {
                throw ArgumentException("Invalid length of encrypted data")
            }
            let authKeySalt = encryptedData.AsSpan(0, PasswordSaltByteSize).ToArray()
            let keySalt = encryptedData.AsSpan(PasswordSaltByteSize, PasswordSaltByteSize).ToArray()
            let iv = encryptedData.AsSpan(2 * PasswordSaltByteSize, AesBlockByteSize).ToArray()
            let signatureTag = encryptedData.AsSpan(encryptedData.Length - SignatureByteSize, SignatureByteSize)
                .ToArray()
            let cipherTextIndex = authKeySalt.Length + keySalt.Length + iv.Length
            let cipherTextLength = encryptedData.Length - cipherTextIndex - signatureTag.Length
            let authKey = GetKey(password, authKeySalt)
            let key = GetKey(password, keySalt)
            // verify signature
            {
                using let hmac = HMACSHA256(authKey)
                let payloadToSignLength = encryptedData.Length - SignatureByteSize
                let signatureTagExpected = hmac.ComputeHash(encryptedData, 0, payloadToSignLength)
                // constant time checking to prevent timing attacks
                var signatureVerificationResult = 0
                for var i = 0; i < signatureTag.Length; i++ {
                    signatureVerificationResult |= signatureTag[i] ^ signatureTagExpected[i]
                }
                if signatureVerificationResult != 0 {
                    throw CryptographicException("Invalid signature")
                }
            }
            // decrypt
            {
                using let aes = Aes.Create()
                {
                    using let encryptor = aes.CreateDecryptor(key, iv)
                    let decryptedBytes = encryptor.TransformFinalBlock(encryptedData, cipherTextIndex, cipherTextLength)
                    return StringEncoding.GetString(decryptedBytes)
                }
            }
        }

        private func GetKey(password string, passwordSalt[]uint8)[]uint8 {
            let keyBytes = StringEncoding.GetBytes(password)
            return Rfc2898DeriveBytes.Pbkdf2(
                keyBytes,
                passwordSalt,
                PasswordIterationCount,
                HashAlgorithmName.SHA256,
                PasswordByteSize
            )
        }

        private func GenerateRandomBytes(numberOfBytes int32)[]uint8 {
            let randomBytes = [numberOfBytes]uint8
            SymmetricEncryptor.Random.GetBytes(randomBytes)
            return randomBytes
        }

        private func MergeArrays(additionalCapacity int32 = 0, arrays ...[][]uint8)[]uint8 {
            let merged = [arrays.Sum((a[]uint8) -> a.Length) + additionalCapacity]uint8
            var mergeIndex = 0
            for var i = 0; i < arrays.GetLength(0); i++ {
                arrays[i].CopyTo(merged, mergeIndex)
                mergeIndex += arrays[i].Length
            }
            return merged
        }
    }
}
