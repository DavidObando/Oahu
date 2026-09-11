package Oahu.Common.Util

import Oahu.Aux.Win32
import System
import System.IO
import System.Runtime.InteropServices

interface IFileCopyCallout {
    func ProcessBuffer(buffer[]uint8, size int32, globalOffset int64);
}

class FileEx {
    shared {
        private const BUFSIZ int32 = 10 * 1000 * 1000
        private const IvlMs int32 = 50

        func Copy(
            sourceFileName string,
            destFileName string,
            overwrite bool,
            report((ProgressMessage) -> void)? = nil,
            cancel(() -> bool)? = nil
        ) bool -> Copy(sourceFileName, destFileName, overwrite, nil, report, cancel)

        func Copy(
            sourceFileName string,
            destFileName string,
            overwrite bool,
            callout IFileCopyCallout?,
            report((ProgressMessage) -> void)? = nil,
            cancel(() -> bool)? = nil
        ) bool {
            if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) {
                return CopyWin32(sourceFileName, destFileName, overwrite, callout, report, cancel)
            } else {
                return CopyPortable(sourceFileName, destFileName, overwrite, callout, report, cancel)
            }
        }

        private func CopyWin32(
            sourceFileName string,
            destFileName string,
            overwrite bool,
            callout IFileCopyCallout?,
            report((ProgressMessage) -> void)?,
            cancel(() -> bool)?
        ) bool {
            let buf = [BUFSIZ]uint8
            let dt0 = DateTime.Now
            var ivlcnt int64 = 0
            let total = FileInfo(sourceFileName).Length
            var count int64 = 0
            {
                using let threadProgress = ThreadProgressPerMille(report)
                {
                    using let wfioRd = WinFileIO(buf)
                    {
                        using let wfioWr = WinFileIO(buf)
                        wfioRd.OpenForReading(sourceFileName)
                        wfioWr.OpenForWriting(destFileName, overwrite)
                        var read = 0
                        while true {
                            if cancel?() ?? false {
                                return false
                            }
                            read = wfioRd.ReadBlocks(BUFSIZ)
                            if read <= 0 {
                                break
                            }
                            callout?.ProcessBuffer(buf, read, count)
                            wfioWr.Write(read)
                            count += int64(read)
                            let dt = DateTime.Now
                            let tot_ms int64 = int32((dt - dt0).TotalMilliseconds)
                            let q = tot_ms / int64(IvlMs)
                            if q <= ivlcnt {
                                continue
                            }
                            ivlcnt = q
                            threadProgress.Report(float64(count) / float64(total))
                        }
                    }
                }
            }
            return true
        }

        private func CopyPortable(
            sourceFileName string,
            destFileName string,
            overwrite bool,
            callout IFileCopyCallout?,
            report((ProgressMessage) -> void)?,
            cancel(() -> bool)?
        ) bool {
            let buf = [BUFSIZ]uint8
            let dt0 = DateTime.Now
            var ivlcnt int64 = 0
            let total = FileInfo(sourceFileName).Length
            var count int64 = 0
            let mode = if overwrite {
                FileMode.Create
            } else {
                FileMode.CreateNew
            }
            {
                using let threadProgress = ThreadProgressPerMille(report)
                {
                    using let fsRd = FileStream(sourceFileName, FileMode.Open, FileAccess.Read, FileShare.Read, BUFSIZ)
                    {
                        using let fsWr = FileStream(destFileName, mode, FileAccess.Write, FileShare.None, BUFSIZ)
                        var read = 0
                        while true {
                            if cancel?() ?? false {
                                return false
                            }
                            read = fsRd.Read(buf, 0, BUFSIZ)
                            if read <= 0 {
                                break
                            }
                            callout?.ProcessBuffer(buf, read, count)
                            fsWr.Write(buf, 0, read)
                            count += int64(read)
                            let dt = DateTime.Now
                            let tot_ms int64 = int32((dt - dt0).TotalMilliseconds)
                            let q = tot_ms / int64(IvlMs)
                            if q <= ivlcnt {
                                continue
                            }
                            ivlcnt = q
                            threadProgress.Report(float64(count) / float64(total))
                        }
                    }
                }
            }
            return true
        }
    }
}
