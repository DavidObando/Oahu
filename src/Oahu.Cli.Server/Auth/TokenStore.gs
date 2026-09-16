package Oahu.Cli.Server.Auth

import Oahu.Cli.App.Paths
import System
import System.IO
import System.Runtime.InteropServices
import System.Runtime.Versioning
import System.Security.AccessControl
import System.Security.Cryptography
import System.Security.Principal
import SystemObject = System.Object

/// Bearer token for the loopback HTTP transport. The token lives in a single file
/// at `<ConfigDir>/server.token` with restrictive permissions (Unix: 0600,
/// Windows: ACL'd to current user only). Generated lazily on first (cref:ReadOrCreate).
///
/// v1 model (per design §15.2 — scopes deferred): a single full-power token. Compare
/// in constant time to thwart trivial timing attacks.
class TokenStore {
    private let cacheLock object = SystemObject()
    private var cached string?

    /// Public for tests; production callers should use the no-arg constructor.
    init(path string? = nil) {
        Path = path ?? Path.Combine(CliPaths.ConfigDir, "server.token")
    }

    prop Path string {
        get;
        init;
    }

    /// Returns the cached token if any has been read this process; otherwise
    /// reads (or creates) once and caches. Loopback HTTP middleware calls this on every
    /// request, so avoid hitting the disk per-request and avoid the cold-start race in
    /// (cref:ReadOrCreate) (two concurrent ReadOrCreate calls could each see the
    /// file as missing and write twice).
    func GetCached() string {
        let v string? = cached
        if v != nil {
            return v
        }
        lock cacheLock {
            cached ??= ReadOrCreate()
            return cached!!
        }
    }

    /// Creates the token if missing; otherwise returns the existing value (and validates the file mode).
    func ReadOrCreate() string {
        let dir = Path.GetDirectoryName(Path)!!
        Directory.CreateDirectory(dir)
        if File.Exists(Path) {
            ValidateMode(Path)
            let existing = File.ReadAllText(Path).Trim()
            if !string.IsNullOrWhiteSpace(existing) {
                return existing
            }
            // empty file — fall through to regenerate.

        }
        return WriteNew(Path)
    }

    /// Atomically replaces the token with a freshly-minted one. Used by `oahu-cli serve token rotate`.
    func Rotate() string {
        let dir = Path.GetDirectoryName(Path)!!
        Directory.CreateDirectory(dir)
        let token = WriteNew(Path)
        lock cacheLock {
            cached = token
        }
        return token
    }

    shared {
        /// Constant-time comparison to defeat trivial timing oracles.
        func Equal(a string?, b string?) bool {
            if a == nil || b == nil {
                return false
            }
            if a.Length != b.Length {
                return false
            }
            var diff = 0
            for var i = 0; i < a.Length; i++ {
                diff |= a[i] ^ b[i]
            }
            return diff == 0
        }

        private func WriteNew(path string) string {
            // 32 random bytes (256 bits) -> base64url, no padding.
            let buf = stackalloc[32]uint8
            RandomNumberGenerator.Fill(buf)
            let token = ToBase64Url(buf)
            // Create with restrictive mode FROM THE START on Unix (no chmod-after window).
            let opts = FileStreamOptions{Mode: FileMode.Create, Access: FileAccess.Write, Share: FileShare.None}
            if !RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                opts.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite
            }
            {
                using let fs = FileStream(path, opts)
                {
                    using let sw = StreamWriter(fs)
                    sw.Write(token)
                    sw.Write('\n')
                }
            }
            // On Windows, tighten the ACL to the current user only.
            if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                TryRestrictWindowsAcl(path)
            }
            return token
        }

        private func ValidateMode(path string) {
            if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                // Best-effort on Windows — relying on NTFS ACLs configured at write-time.
                return
            }
            let mode = File.GetUnixFileMode(path)
            const forbidden = UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute
            if (mode & forbidden) != 0 {
                throw InvalidOperationException(
                    "Token file $path has overly permissive mode ($mode); refusing to start. " +
                        "Run `chmod 600 \"" +
                        path +
                        "\"` and retry, or delete the file to regenerate."
                )
            }
        }

        @System.Runtime.Versioning.SupportedOSPlatform("windows")
        private func TryRestrictWindowsAcl(path string) {
            try {
                let fi = FileInfo(path)
                let sec = fi.GetAccessControl()
                sec.SetAccessRuleProtection(isProtected: true, preserveInheritance: false)
                // Strip everyone, add current user only.
                let sid = WindowsIdentity.GetCurrent().User!!
                let rule = FileSystemAccessRule(sid, FileSystemRights.FullControl, AccessControlType.Allow)
                // Remove all then add ours.
                let current = sec.GetAccessRules(true, true, typeof(SecurityIdentifier))
                for r FileSystemAccessRule in current {
                    sec.RemoveAccessRule(r)
                }
                sec.AddAccessRule(rule)
                fi.SetAccessControl(sec)
            } catch {
                // Best-effort. The token is already in a per-user APPDATA folder.

            }
        }

        private func ToBase64Url(bytes ReadOnlySpan[uint8]) string {
            let s = Convert.ToBase64String(bytes)
            return s.TrimEnd('=').Replace('+', '-').Replace('/', '_')
        }
    }
}
