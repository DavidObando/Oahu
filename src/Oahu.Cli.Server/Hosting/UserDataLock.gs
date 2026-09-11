package Oahu.Cli.Server.Hosting

import Oahu.Cli.App.Paths
import System
import System.Diagnostics
import System.Globalization
import System.IO
import System.Text

/// Cooperative file lock under `<SharedUserDataDir>/server.lock`. Held for the
/// lifetime of the running server. v1 enforces "one CLI server at a time"; full
/// cooperation with the GUI is documented as a known gap (the GUI doesn't take a
/// matching lock yet).
///
/// We open the lock file with (cref:FileShare.Read) so a contending process
/// can read the recorded PID for a friendlier error message, but cannot acquire its
/// own write lock.
class UserDataLock : IDisposable {
    private var stream FileStream?

    prop Path string {
        get;
        init;
    }

    init(path string? = nil) {
        Path = path ?? Path.Combine(CliPaths.SharedUserDataDir, "server.lock")
    }

    /// Acquires the lock or throws an (cref:InvalidOperationException) with the holder's PID (if known).
    func Acquire() {
        if stream != nil {
            return
        }
        let dir = Path.GetDirectoryName(Path)!!
        Directory.CreateDirectory(dir)
        try {
            stream = FileStream(
                Path,
                FileMode.OpenOrCreate,
                FileAccess.ReadWrite,
                FileShare.Read | FileShare.Delete,
                bufferSize: 4096,
                FileOptions.WriteThrough | FileOptions.DeleteOnClose
            )
        } catch (ex IOException) {
            let holder = TryReadHolder()
            let suffix = if holder == nil {
                string.Empty
            } else {
                " (held by PID $holder)"
            }
            throw InvalidOperationException(
                "oahu-cli serve: another server is already running$suffix. " + "Lock file: $Path",
                ex
            )
        }
        // Record our PID so a contending process can report it.
        stream!!.SetLength(0)
        let pid = Environment.ProcessId.ToString(CultureInfo.InvariantCulture)
        let bytes = Encoding.UTF8.GetBytes(pid + "\n")
        stream!!.Write(bytes, 0, bytes.Length)
        stream!!.Flush()
    }

    func TryReadHolder() int32? {
        try {
            using let fs = FileStream(Path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)
            using let sr = StreamReader(fs)
            let line = sr.ReadLine()
            if int32.TryParse(line, NumberStyles.Integer, CultureInfo.InvariantCulture, out var pid) && IsRunning(pid) {
                return pid
            }
        } catch {
            // file may not exist or may be locked exclusively — fall through.

        }
        return nil
    }

    func Dispose() {
        let s FileStream? = stream
        stream = nil
        if s == nil {
            return
        }
        try {
            // FileOptions.DeleteOnClose handles unlink atomically when this stream closes,
            // so there's no race window where another process could acquire the lock
            // pointing at our about-to-be-deleted file.
            s.Close()
        } catch {
            // best-effort cleanup.

        }
    }

    shared {
        private func IsRunning(pid int32) bool {
            try {
                using let p = Process.GetProcessById(pid)
                return !p.HasExited
            } catch {
                return false
            }
        }
    }
}
