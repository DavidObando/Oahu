package Oahu.Cli.Server.Hosting

import System
import System.Diagnostics
import System.Diagnostics.CodeAnalysis
import System.Net.Sockets
import System.Runtime.InteropServices

/// Resolves the peer UID of a Unix-domain-socket client connection. Used by the
/// optional `--strict-peer` mode in `oahu-cli serve` to ensure that a
/// connecting client process belongs to the same user as the server. Linux uses
/// `SO_PEERCRED`; macOS uses `LOCAL_PEERCRED` via `getsockopt`.
/// @remarks Returns `null` on platforms where peer-credential lookup is unavailable
/// (Windows, BSD variants we haven't tested) or when the underlying syscall
/// fails. Callers should treat `null` as "unknown" — the strict-peer
/// caller policy is to ALLOW unknown peers but log a warning, since rejecting
/// would brick the server on platforms we haven't covered yet.
@SuppressMessage(
    "StyleCop.CSharp.NamingRules",
    "SA1310:Field names should not contain underscore",
    Justification: "Constants mirror libc/syscall identifiers."
)
@SuppressMessage(
    "StyleCop.CSharp.OrderingRules",
    "SA1202:Elements should be ordered by access",
    Justification: "Public methods grouped near related private P/Invoke decls for readability."
)
internal class PeerCredentials {
    @StructLayout(LayoutKind.Sequential)
    private struct LinuxUcred {
        var Pid int32
        var Uid uint32
        var Gid uint32
    }

    @StructLayout(LayoutKind.Sequential)
    @SuppressMessage(
        "StyleCop.CSharp.NamingRules",
        "SA1307:Accessible fields should begin with upper-case letter",
        Justification: "Mirrors xucred(4) struct field names verbatim."
    )
    private struct MacXucred {
        var cr_version uint32
        var cr_uid uint32
        var cr_ngroups uint32
    }

    shared {
        private const SOL_SOCKET int32 = 1
        private const SO_PEERCRED int32 = 17
        private const SOL_LOCAL int32 = 0
        private const LOCAL_PEERCRED int32 = 0x001

        @DllImport("libc", EntryPoint: "getsockopt", SetLastError: true)
        private func GetsockoptLinux(
            sockfd int32,
            level int32,
            optname int32,
            ref optval LinuxUcred,
            ref optlen uint32
        ) int32;

        @DllImport("libc", EntryPoint: "getsockopt", SetLastError: true)
        private func GetsockoptMac(
            sockfd int32,
            level int32,
            optname int32,
            ref optval MacXucred,
            ref optlen uint32
        ) int32;

        /// Returns the peer UID for the given socket, or `null` if the
        /// platform does not support peer-credential lookup or the syscall fails.
        func TryGetPeerUid(socket Socket?) uint32? {
            if socket == nil {
                return nil
            }
            // Get the OS file descriptor. .NET 8+ exposes Handle as a SafeSocketHandle/IntPtr.
            let handle = int32(socket.Handle.ToInt64())
            if handle <= 0 {
                return nil
            }
            if OperatingSystem.IsLinux() {
                var cred = default(LinuxUcred)
                var len = uint32(Marshal.SizeOf[LinuxUcred]())
                if GetsockoptLinux(handle, SOL_SOCKET, SO_PEERCRED, &cred, &len) == 0 {
                    return cred.Uid
                }
                return nil
            }
            if OperatingSystem.IsMacOS() {
                var cred = default(MacXucred)
                var len = uint32(Marshal.SizeOf[MacXucred]())
                if GetsockoptMac(handle, SOL_LOCAL, LOCAL_PEERCRED, &cred, &len) == 0 {
                    return cred.cr_uid
                }
                return nil
            }
            return nil
        }

        /// The current process's effective UID (Linux/macOS), or `null` on Windows.
        func GetCurrentUid() uint32? {
            if OperatingSystem.IsWindows() {
                return nil
            }
            try {
                return Geteuid()
            } catch (DllNotFoundException) {
                return nil
            }
        }

        @DllImport("libc", EntryPoint: "geteuid")
        private func Geteuid() uint32;
    }
}
