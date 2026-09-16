package Oahu.Aux.Win32

import Microsoft.Win32.SafeHandles
import System
import System.ComponentModel
import System.IO
import System.Runtime.InteropServices

unsafe open class WinFileIO : IDisposable {
    private var gchBuf GCHandle
    private var handle SafeHandle?
    private var pBuffer *void

    init() { }

    init(buffer Array) {
        // This constructor is provided so that the buffer can be pinned in memory.
        // Cleanup must be called in order to unpin the buffer.
        PinBuffer(buffer)
    }

    deinit {
        // Finalizer gets called by the garbage collector if the user did not call Dispose.
        Dispose(false)
    }

    func Dispose() {
        // This method should be called to clean everything up.
        Dispose(true)
        // Tell the GC not to finalize since clean up has already been done.
        GC.SuppressFinalize(this)
    }

    func PinBuffer(buffer Array) {
        // This function must be called to pin the buffer in memory before any file I/O is done.
        // This shows how to pin a buffer in memory for an extended period of time without using
        // the "Fixed" statement.  Pinning a buffer in memory can take some cycles, so this technique
        // is helpful when doing quite a bit of file I/O.
        //
        // Make sure we don't leak memory if this function was called before and the UnPinBuffer was not called.
        UnpinBuffer()
        gchBuf = GCHandle.Alloc(buffer, GCHandleType.Pinned)
        let pAddr = Marshal.UnsafeAddrOfPinnedArrayElement(buffer, 0)
        // pBuffer is the pointer used for all of the I/O functions in this class.
        pBuffer = *void(pAddr.ToPointer())
    }

    func UnpinBuffer() {
        // This function unpins the buffer and needs to be called before a new buffer is pinned or
        // when disposing of this object.  It does not need to be called directly since the code in Dispose
        // or PinBuffer will automatically call this function.
        if gchBuf.IsAllocated {
            gchBuf.Free()
        }
    }

    func OpenForReading(fileName string) {
        // This function uses the Windows API CreateFile function to open an existing file.
        // A return value of true indicates success.
        Close()
        handle = CreateFile(fileName, GenericRead, FileShareRead, 0, OpenExisting, 0, 0)
        if handle!!.IsInvalid {
            let we = Win32Exception()
            let ae = IOException("WinFileIO:OpenForReading - Could not open file " + fileName + " - " + we.Message)
            throw ae
        }
    }

    func OpenForWriting(fileName string, overwrite bool) {
        // This function uses the Windows API CreateFile function to open an existing file.
        // If the file exists, it will be overwritten.
        Close()
        let create = if overwrite {
            CreateAlways
        } else {
            CreateNew
        }
        handle = CreateFile(fileName, GenericWrite, 0, 0, create, 0, 0)
        if handle!!.IsInvalid {
            let we = Win32Exception()
            let ae = IOException("WinFileIO:OpenForWriting - Could not open file " + fileName + " - " + we.Message)
            throw ae
        }
    }

    func Read(bytesToRead int32) int32 {
        // This function reads in a file up to BytesToRead using the Windows API function ReadFile.  The return value
        // is the number of bytes read.
        var bytesRead = 0
        if !ReadFile(handle, pBuffer, bytesToRead, &bytesRead, 0) {
            let we = Win32Exception()
            let ae = IOException("WinFileIO:Read - Error occurred reading a file. - " + we.Message)
            throw ae
        }
        return bytesRead
    }

    func ReadUntilEOF() int32 {
        // This function reads in chunks at a time instead of the entire file.  Make sure the file is <= 2GB.
        // Also, if the buffer is not large enough to read the file, then an ApplicationException will be thrown.
        // No check is made to see if the buffer is large enough to hold the file.  If this is needed, then
        // use the ReadBlocks function below.
        var bytesReadInBlock = 0
        var bytesRead = 0
        var pBuf = *uint8(pBuffer)
        // Do until there are no more bytes to read or the buffer is full.
        for ; ; {
            if !ReadFile(handle, *void(pBuf), BlockSize, &bytesReadInBlock, 0) {
                // This is an error condition.  The error msg can be obtained by creating a Win32Exception and
                // using the Message property to obtain a description of the error that was encountered.
                let we = Win32Exception()
                let ae = IOException("WinFileIO:ReadUntilEOF - Error occurred reading a file. - " + we.Message)
                throw ae
            }
            if bytesReadInBlock == 0 {
                break
            }
            bytesRead += bytesReadInBlock
            pBuf += bytesReadInBlock
        }
        return bytesRead
    }

    func ReadBlocks(bytesToRead int32) int32 {
        // This function reads a total of BytesToRead at a time.  There is a limit of 2gb per call.
        var bytesReadInBlock = 0
        var bytesRead = 0
        var blockByteSize int32
        var pBuf = *uint8(pBuffer)
        // Do until there are no more bytes to read or the buffer is full.
        do {
            blockByteSize = Math.Min(BlockSize, bytesToRead - bytesRead)
            if !ReadFile(handle, *void(pBuf), blockByteSize, &bytesReadInBlock, 0) {
                let we = Win32Exception()
                let ae = IOException("WinFileIO:ReadBytes - Error occurred reading a file. - " + we.Message)
                throw ae
            }
            if bytesReadInBlock == 0 {
                break
            }
            bytesRead += bytesReadInBlock
            pBuf += bytesReadInBlock
        } while bytesRead < bytesToRead
        return bytesRead
    }

    func Write(bytesToWrite int32) int32 {
        // Writes out the file in one swoop using the Windows WriteFile function.
        var numberOfBytesWritten int32
        if !WriteFile(handle, pBuffer, bytesToWrite, &numberOfBytesWritten, 0) {
            let we = Win32Exception()
            let ae = IOException("WinFileIO:Write - Error occurred writing a file. - " + we.Message)
            throw ae
        }
        return numberOfBytesWritten
    }

    func WriteBlocks(numBytesToWrite int32) int32 {
        // This function writes out chunks at a time instead of the entire file.  This is the fastest write function,
        // perhaps because the block size is an even multiple of the sector size.
        var bytesWritten = 0
        var bytesToWrite int32
        var remainingBytes int32
        var bytesOutput = 0
        var pBuf = *uint8(pBuffer)
        remainingBytes = numBytesToWrite
        // Do until there are no more bytes to write.
        do {
            bytesToWrite = Math.Min(remainingBytes, BlockSize)
            if !WriteFile(handle, *void(pBuf), bytesToWrite, &bytesWritten, 0) {
                // This is an error condition.  The error msg can be obtained by creating a Win32Exception and
                // using the Message property to obtain a description of the error that was encountered.
                let we = Win32Exception()
                let ae = IOException("WinFileIO:WriteBlocks - Error occurred writing a file. - " + we.Message)
                throw ae
            }
            pBuf += bytesToWrite
            bytesOutput += bytesToWrite
            remainingBytes -= bytesToWrite
        } while remainingBytes > 0
        return bytesOutput
    }

    func Close() bool {
        // This function closes the file handle.
        if !(handle == nil || handle!!.IsInvalid || handle!!.IsClosed) {
            handle!!.Close()
            return true
        }
        return false
    }

    protected func Dispose(disposing bool) {
        // This function frees up the unmanaged resources of this class.
        Close()
        UnpinBuffer()
    }

    shared {
        // This class provides the capability to utilize the ReadFile and Writefile windows IO functions.  These functions
        // are the most efficient way to perform file I/O from C# or even C++.  The constructor with the buffer and buffer
        // size should usually be called to init this class.  PinBuffer is provided as an alternative.  The reason for this
        // is because a pointer needs to be obtained before the ReadFile or WriteFile functions are called.
        //
        // Error handling - In each public function of this class where an error can occur, an ApplicationException is
        // thrown with the Win32Exception message info if an error is detected.  If no exception is thrown, then a normal
        // return is considered success.
        //
        // This code is not thread safe.  Thread control primitives need to be added if running this in a multi-threaded
        // environment.
        //
        // The recommended and fastest function for reading from a file is to call the ReadBlocks method.
        // The recommended and fastest function for writing to a file is to call the WriteBlocks method.
        //
        // License and disclaimer:
        // This software is free to use by any individual or entity for any endeavor for profit or not.
        // Even though this code has been tested and automated unit tests are provided, there is no gaurantee that
        // it will run correctly with your system or environment.  I am not responsible for any failure and you agree
        // that you accept any and all risk for using this software.
        //
        //
        // Written by Robert G. Bryan in Feb, 2011.
        //
        // Constants required to handle file I/O:
        private const GenericRead uint32 = 0x80000000U

        private const GenericWrite uint32 = uint32(0x40000000)
        private const OpenExisting uint32 = uint32(3)
        private const CreateAlways uint32 = uint32(2)
        private const CreateNew uint32 = uint32(1)
        private const FileShareRead uint32 = uint32(1)
        private const BlockSize int32 = 65536

        // Define the Windows system functions that are called by this class via COM Interop:
        @System.Runtime.InteropServices.DllImport("kernel32", SetLastError: true, CharSet: CharSet.Unicode)
        private func CreateFile(
            fileName string,
            desiredAccess uint32,
            shareMode uint32,
            securityAttributes uint32,
            creationDisposition uint32,
            flagsAndAttributes uint32,
            hTemplateFile int32
        ) SafeFileHandle;

        @System.Runtime.InteropServices.DllImport("kernel32", SetLastError: true)
        private func ReadFile(
            handle SafeHandle?,
            pBuffer *void,
            numberOfBytesToRead int32,
            pNumberOfBytesRead *int32,
            overlapped int32
        ) bool;

        @System.Runtime.InteropServices.DllImport("kernel32", SetLastError: true)
        private func WriteFile(
            handle SafeHandle?,
            pBuffer *void,
            numberOfBytesToWrite int32,
            pNumberOfBytesWritten *int32,
            overlapped int32
        ) bool;

        @System.Runtime.InteropServices.DllImport("kernel32", SetLastError: true)
        private func CloseHandle(hObject nint) bool;
    }
}
