package Oahu.Cli.App.Credentials

import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Runtime.InteropServices
import System.Runtime.Versioning
import System.Security.Cryptography
import System.Text
import System.Text.Json
import System.Threading
import System.Threading.Tasks
import SystemObject = System.Object

/// Windows DPAPI-backed credential store. Secrets are encrypted with
/// (cref:DataProtectionScope.CurrentUser) so they're scoped to the signed-in
/// Windows account; the encrypted blob lives next to `config.json`.
@SupportedOSPlatform("windows")
class WindowsDpapiCredentialStore : ICredentialStore {
    private let filePath string
    private let writeLock object = SystemObject()

    init(filePath string) {
        this.filePath = filePath
    }

    prop Provider string -> "dpapi"

    func GetAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) Task[string?] {
        ArgumentException.ThrowIfNullOrWhiteSpace(account)
        cancellationToken.ThrowIfCancellationRequested()
        let map_ = LoadLocked()
        return Task.FromResult(
            if map_.TryGetValue(account, out var v) {
                v
            } else {
                default(string?)
            }
        )
    }

    func SetAsync(
        account string,
        secret string,
        cancellationToken CancellationToken = default(CancellationToken)
    ) Task {
        ArgumentException.ThrowIfNullOrWhiteSpace(account)
        ArgumentNullException.ThrowIfNull(secret)
        cancellationToken.ThrowIfCancellationRequested()
        lock writeLock {
            let map_ = LoadLocked()
            map_[account] = secret
            PersistLocked(map_)
        }
        return Task.CompletedTask
    }

    func DeleteAsync(account string, cancellationToken CancellationToken = default(CancellationToken)) Task[bool] {
        ArgumentException.ThrowIfNullOrWhiteSpace(account)
        cancellationToken.ThrowIfCancellationRequested()
        lock writeLock {
            let map_ = LoadLocked()
            if !map_.Remove(account) {
                return Task.FromResult(false)
            }
            PersistLocked(map_)
            return Task.FromResult(true)
        }
    }

    func ListAccountsAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[
        IReadOnlyList[string]
    ] {
        cancellationToken.ThrowIfCancellationRequested()
        return Task.FromResult[IReadOnlyList[string]](LoadLocked().Keys.ToArray())
    }

    private func LoadLocked() Dictionary[string, string] {
        if !File.Exists(filePath) {
            return Dictionary[string, string](StringComparer.OrdinalIgnoreCase)
        }
        let encrypted = File.ReadAllBytes(filePath)
        if encrypted.Length == 0 {
            return Dictionary[string, string](StringComparer.OrdinalIgnoreCase)
        }
        let json = ProtectedData.Unprotect(encrypted, optionalEntropy: nil, scope_: DataProtectionScope.CurrentUser)
        let map_ Dictionary[string, string]? = JsonSerializer.Deserialize[Dictionary[string, string]](
            Encoding.UTF8.GetString(json)
        )
        return if map_ == nil {
            Dictionary[string, string](StringComparer.OrdinalIgnoreCase)
        } else {
            Dictionary[string, string](map_, StringComparer.OrdinalIgnoreCase)
        }
    }

    private func PersistLocked(map_ Dictionary[string, string]) {
        let dir = Path.GetDirectoryName(filePath)
        if !string.IsNullOrEmpty(dir) {
            Directory.CreateDirectory(dir)
        }
        let json = JsonSerializer.SerializeToUtf8Bytes(map_)
        let encrypted = ProtectedData.Protect(json, optionalEntropy: nil, scope_: DataProtectionScope.CurrentUser)
        let tmp = filePath + ".tmp"
        {
            using let stream = FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None)
            stream.Write(encrypted)
            stream.Flush(flushToDisk: true)
        }
        File.Move(tmp, filePath, overwrite: true)
    }
}
