package Oahu.SystemManagement

import Oahu.CommonTypes
import System
import System.Diagnostics
import System.Runtime.InteropServices
import System.Text.Json

class MacHardwareIdProvider : IHardwareIdProvider {
    private var cachedCpuId string?
    private var cachedMotherboardId string?
    private var cachedDiskId string?

    func GetCpuId() string? {
        if cachedCpuId != nil {
            return cachedCpuId!!
        }
        try {
            // Use sysctl to get CPU brand string as a stable identifier
            cachedCpuId = RunCommand("sysctl", "-n machdep.cpu.brand_string")?.Trim() ?? string.Empty
            return cachedCpuId
        } catch (Exception) {
            return string.Empty
        }
    }

    func GetMotherboardId() string? {
        if cachedMotherboardId != nil {
            return cachedMotherboardId!!
        }
        try {
            // Hardware UUID is the macOS equivalent of a motherboard serial
            cachedMotherboardId = RunCommand("ioreg", "-rd1 -c IOPlatformExpertDevice")?.ExtractIoregValue(
                "IOPlatformUUID"
            ) ?? string.Empty
            return cachedMotherboardId
        } catch (Exception) {
            return string.Empty
        }
    }

    func GetMotherboardPnpDeviceId() string? {
        try {
            // Serial number serves as a secondary identifier on macOS
            return RunCommand("ioreg", "-rd1 -c IOPlatformExpertDevice")?.ExtractIoregValue(
                "IOPlatformSerialNumber"
            ) ?? string.Empty
        } catch (Exception) {
            return string.Empty
        }
    }

    func GetDiskId() string? {
        if cachedDiskId != nil {
            return cachedDiskId!!
        }
        try {
            // Get the volume UUID of the root filesystem
            cachedDiskId = RunCommand("diskutil", "info -plist /")?.ExtractPlistValue("VolumeUUID") ?? string.Empty
            return cachedDiskId
        } catch (Exception) {
            return string.Empty
        }
    }

    shared {
        private func RunCommand(command string, arguments string) string? {
            try {
                let psi = ProcessStartInfo{
                    FileName: command,
                    Arguments: arguments,
                    RedirectStandardOutput: true,
                    UseShellExecute: false,
                    CreateNoWindow: true
                }
                using let process Process? = Process.Start(psi)
                let output string? = process?.StandardOutput.ReadToEnd()
                process?.WaitForExit()
                return output
            } catch (Exception) {
                return nil
            }
        }
    }
}

internal func (ioregOutput string?) ExtractIoregValue(key string) string? {
    if string.IsNullOrEmpty(ioregOutput) {
        return nil
    }
    // ioreg output format: "key" = "value"
    let search = "\"$key\" = \""
    var idx = ioregOutput.IndexOf(search, StringComparison.Ordinal)
    if idx < 0 {
        return nil
    }
    idx += search.Length
    let endIdx = ioregOutput.IndexOf('"', idx)
    if endIdx < 0 {
        return nil
    }
    return ioregOutput.Substring(idx, endIdx - idx)
}

internal func (plistOutput string?) ExtractPlistValue(key string) string? {
    if string.IsNullOrEmpty(plistOutput) {
        return nil
    }
    // Simple plist XML extraction: <key>Key</key>\n<string>Value</string>
    let keyTag = "<key>$key</key>"
    var idx = plistOutput.IndexOf(keyTag, StringComparison.Ordinal)
    if idx < 0 {
        return nil
    }
    idx += keyTag.Length
    let remaining = plistOutput.Substring(idx)
    let startTag = "<string>"
    let endTag = "</string>"
    var startIdx = remaining.IndexOf(startTag, StringComparison.Ordinal)
    if startIdx < 0 {
        return nil
    }
    startIdx += startTag.Length
    let endIdx = remaining.IndexOf(endTag, startIdx, StringComparison.Ordinal)
    if endIdx < 0 {
        return nil
    }
    return remaining.Substring(startIdx, endIdx - startIdx)
}
