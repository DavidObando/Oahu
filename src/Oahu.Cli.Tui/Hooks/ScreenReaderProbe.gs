package Oahu.Cli.Tui.Hooks

import System
import System.Runtime.InteropServices

/// Best-effort screen-reader detection. Phase 2 honours environment overrides
/// universally and queries `SystemParametersInfo(SPI_GETSCREENREADER)` on
/// Windows; macOS / Linux native probes are reserved for Phase 9.
///
/// Always assume a false-negative rate: a user who needs the accessibility
/// path can opt in explicitly with `OAHU_SCREEN_READER=1`.
class ScreenReaderProbe {
    private class NativeMethods {
        shared {
            @DllImport("user32.dll", EntryPoint: "SystemParametersInfoW", SetLastError: true)
            @return: MarshalAs(UnmanagedType.Bool)
            func SystemParametersInfo(
                uiAction uint32,
                uiParam uint32,
                @System
                    .Runtime
                    .InteropServices
                    .MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool) ref pvParam bool,
                fWinIni uint32
            ) bool;
        }
    }

    shared {
        private const SpiGetscreenreader uint32 = uint32(0x0046)
        func IsActive() bool -> CheckEnv() || CheckWin32()

        private func CheckEnv() bool {
            if string.Equals(Environment.GetEnvironmentVariable("OAHU_NO_TUI"), "1", StringComparison.Ordinal) {
                return true
            }
            if string.Equals(Environment.GetEnvironmentVariable("OAHU_SCREEN_READER"), "1", StringComparison.Ordinal) {
                return true
            }
            return false
        }

        private func CheckWin32() bool {
            if !RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                return false
            }
            try {
                var active = false
                if NativeMethods.SystemParametersInfo(SpiGetscreenreader, 0, &active, 0) {
                    return active
                }
            } catch {
                // Not all Windows hosts (Nano Server, sandboxes) expose the SPI; treat as not-active.

            }
            return false
        }
    }
}
