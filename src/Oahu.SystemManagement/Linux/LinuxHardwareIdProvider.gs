package Oahu.SystemManagement

import Oahu.CommonTypes
import System
import System.Diagnostics
import System.IO

class LinuxHardwareIdProvider : IHardwareIdProvider {
    private var cachedCpuId string?
    private var cachedMotherboardId string?
    private var cachedDiskId string?

    func GetCpuId() string? {
        if cachedCpuId != nil {
            return cachedCpuId!!
        }
        try {
            // Try lscpu for CPU model name
            let output string? = RunCommand("lscpu", "")
            cachedCpuId = ExtractLscpuValue(output, "Model name") ?? string.Empty
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
            // Use /etc/machine-id as primary stable identifier (systemd-based distros)
            let machineIdPath = "/etc/machine-id"
            if File.Exists(machineIdPath) {
                cachedMotherboardId = File.ReadAllText(machineIdPath).Trim()
                return cachedMotherboardId
            }
            // Fallback to DMI board serial
            let dmiPath = "/sys/class/dmi/id/board_serial"
            if File.Exists(dmiPath) {
                cachedMotherboardId = File.ReadAllText(dmiPath).Trim()
                return cachedMotherboardId
            }
            cachedMotherboardId = string.Empty
            return cachedMotherboardId
        } catch (Exception) {
            return string.Empty
        }
    }

    func GetMotherboardPnpDeviceId() string? {
        try {
            // Use DMI product name as a secondary identifier
            let dmiPath = "/sys/class/dmi/id/product_name"
            if File.Exists(dmiPath) {
                return File.ReadAllText(dmiPath).Trim()
            }
            return string.Empty
        } catch (Exception) {
            return string.Empty
        }
    }

    func GetDiskId() string? {
        if cachedDiskId != nil {
            return cachedDiskId!!
        }
        try {
            // Use lsblk to get the serial of the root disk
            var output string? = RunCommand("lsblk", "-ndo SERIAL /dev/sda")
            cachedDiskId = output?.Trim() ?? string.Empty
            if string.IsNullOrEmpty(cachedDiskId) {
                // Fallback: try nvme drive
                output = RunCommand("lsblk", "-ndo SERIAL /dev/nvme0n1")
                cachedDiskId = output?.Trim() ?? string.Empty
            }
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

        private func ExtractLscpuValue(lscpuOutput string?, key string) string? {
            if string.IsNullOrEmpty(lscpuOutput) {
                return nil
            }
            for line in lscpuOutput.Split('\n') {
                if line.StartsWith(key, StringComparison.OrdinalIgnoreCase) {
                    let colonIdx = line.IndexOf(':')
                    if colonIdx >= 0 {
                        return line.Substring(colonIdx + 1).Trim()
                    }
                }
            }
            return nil
        }
    }
}
