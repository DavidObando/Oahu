package Oahu.Aux

import System
import System.Diagnostics
import System.IO

class ShellExecute {
    shared {
        func Url(uri Uri) -> ShellExecute.File(uri.OriginalString)

        func File(url string) {
            Process.Start(ProcessStartInfo{UseShellExecute: true, CreateNoWindow: true, FileName: url})
        }

        func Directory(path string) {
            if string.IsNullOrWhiteSpace(path) {
                throw ArgumentException("Directory path is required.", "path")
            }
            Directory.CreateDirectory(path)
            var startInfo ProcessStartInfo
            if OperatingSystem.IsWindows() {
                startInfo = ProcessStartInfo{
                    FileName: "explorer.exe",
                    ArgumentList: {path},
                    UseShellExecute: false,
                    CreateNoWindow: true
                }
            } else if OperatingSystem.IsMacOS() {
                startInfo = ProcessStartInfo{
                    FileName: "open",
                    ArgumentList: {path},
                    UseShellExecute: false,
                    CreateNoWindow: true
                }
            } else if OperatingSystem.IsLinux() {
                startInfo = ProcessStartInfo{
                    FileName: "xdg-open",
                    ArgumentList: {path},
                    UseShellExecute: false,
                    CreateNoWindow: true
                }
            } else {
                throw PlatformNotSupportedException("Opening directories is not supported on this platform.")
            }
            Process.Start(startInfo)
        }
    }
}
