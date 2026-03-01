using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Oahu.Aux.Win32
{
  public unsafe class WinFileIO : IDisposable
  {
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
    private const uint GenericRead = 0x80000000;
    private const uint GenericWrite = 0x40000000;
    private const uint OpenExisting = 3;
    private const uint CreateAlways = 2;
    private const uint CreateNew = 1;
    private const uint FileShareRead = 1;
    private const int BlockSize = 65536;

    private GCHandle gchBuf;            // Handle to GCHandle object used to pin the I/O buffer in memory.
    private SafeHandle handle;          // Handle to the file to be read from or written to
    private void* pBuffer;              // Pointer to the buffer used to perform I/O.

    public WinFileIO()
    {
    }

    public WinFileIO(Array buffer)
    {
      // This constructor is provided so that the buffer can be pinned in memory.
      // Cleanup must be called in order to unpin the buffer.
      PinBuffer(buffer);
    }

    ~WinFileIO()
    {
      // Finalizer gets called by the garbage collector if the user did not call Dispose.
      Dispose(false);
    }

    public void Dispose()
    {
      // This method should be called to clean everything up.
      Dispose(true);

      // Tell the GC not to finalize since clean up has already been done.
      GC.SuppressFinalize(this);
    }

    public void PinBuffer(Array buffer)
    {
      // This function must be called to pin the buffer in memory before any file I/O is done.
      // This shows how to pin a buffer in memory for an extended period of time without using
      // the "Fixed" statement.  Pinning a buffer in memory can take some cycles, so this technique
      // is helpful when doing quite a bit of file I/O.
      //
      // Make sure we don't leak memory if this function was called before and the UnPinBuffer was not called.
      UnpinBuffer();
      gchBuf = GCHandle.Alloc(buffer, GCHandleType.Pinned);
      IntPtr pAddr = Marshal.UnsafeAddrOfPinnedArrayElement(buffer, 0);

      // pBuffer is the pointer used for all of the I/O functions in this class.
      pBuffer = (void*)pAddr.ToPointer();
    }

    public void UnpinBuffer()
    {
      // This function unpins the buffer and needs to be called before a new buffer is pinned or
      // when disposing of this object.  It does not need to be called directly since the code in Dispose
      // or PinBuffer will automatically call this function.
      if (gchBuf.IsAllocated)
      {
        gchBuf.Free();
      }
    }

    public void OpenForReading(string fileName)
    {
      // This function uses the Windows API CreateFile function to open an existing file.
      // A return value of true indicates success.
      Close();
      handle = CreateFile(fileName, GenericRead, FileShareRead, 0, OpenExisting, 0, 0);
      if (handle.IsInvalid)
      {
        Win32Exception we = new Win32Exception();
        IOException ae = new IOException("WinFileIO:OpenForReading - Could not open file " +
          fileName + " - " + we.Message);
        throw ae;
      }
    }

    public void OpenForWriting(string fileName, bool overwrite)
    {
      // This function uses the Windows API CreateFile function to open an existing file.
      // If the file exists, it will be overwritten.
      Close();
      uint create = overwrite ? CreateAlways : CreateNew;
      handle = CreateFile(fileName, GenericWrite, 0, 0, create, 0, 0);
      if (handle.IsInvalid)
      {
        Win32Exception we = new Win32Exception();
        IOException ae = new IOException("WinFileIO:OpenForWriting - Could not open file " +
          fileName + " - " + we.Message);
        throw ae;
      }
    }

    public int Read(int bytesToRead)
    {
      // This function reads in a file up to BytesToRead using the Windows API function ReadFile.  The return value
      // is the number of bytes read.
      int bytesRead = 0;
      if (!ReadFile(handle, pBuffer, bytesToRead, &bytesRead, 0))
      {
        Win32Exception we = new Win32Exception();
        IOException ae = new IOException("WinFileIO:Read - Error occurred reading a file. - " +
          we.Message);
        throw ae;
      }

      return bytesRead;
    }

    public int ReadUntilEOF()
    {
      // This function reads in chunks at a time instead of the entire file.  Make sure the file is <= 2GB.
      // Also, if the buffer is not large enough to read the file, then an ApplicationException will be thrown.
      // No check is made to see if the buffer is large enough to hold the file.  If this is needed, then
      // use the ReadBlocks function below.
      int bytesReadInBlock = 0, bytesRead = 0;
      byte* pBuf = (byte*)pBuffer;

      // Do until there are no more bytes to read or the buffer is full.
      for (; ;)
      {
        if (!ReadFile(handle, pBuf, BlockSize, &bytesReadInBlock, 0))
        {
          // This is an error condition.  The error msg can be obtained by creating a Win32Exception and
          // using the Message property to obtain a description of the error that was encountered.
          Win32Exception we = new Win32Exception();
          IOException ae = new IOException("WinFileIO:ReadUntilEOF - Error occurred reading a file. - "
            + we.Message);
          throw ae;
        }

        if (bytesReadInBlock == 0)
        {
          break;
        }

        bytesRead += bytesReadInBlock;
        pBuf += bytesReadInBlock;
      }

      return bytesRead;
    }

    public int ReadBlocks(int bytesToRead)
    {
      // This function reads a total of BytesToRead at a time.  There is a limit of 2gb per call.
      int bytesReadInBlock = 0, bytesRead = 0, blockByteSize;
      byte* pBuf = (byte*)pBuffer;

      // Do until there are no more bytes to read or the buffer is full.
      do
      {
        blockByteSize = Math.Min(BlockSize, bytesToRead - bytesRead);
        if (!ReadFile(handle, pBuf, blockByteSize, &bytesReadInBlock, 0))
        {
          Win32Exception we = new Win32Exception();
          IOException ae = new IOException("WinFileIO:ReadBytes - Error occurred reading a file. - "
            + we.Message);
          throw ae;
        }

        if (bytesReadInBlock == 0)
        {
          break;
        }

        bytesRead += bytesReadInBlock;
        pBuf += bytesReadInBlock;
      }
      while (bytesRead < bytesToRead);
      return bytesRead;
    }

    public int Write(int bytesToWrite)
    {
      // Writes out the file in one swoop using the Windows WriteFile function.
      int numberOfBytesWritten;
      if (!WriteFile(handle, pBuffer, bytesToWrite, &numberOfBytesWritten, 0))
      {
        Win32Exception we = new Win32Exception();
        IOException ae = new IOException("WinFileIO:Write - Error occurred writing a file. - " +
          we.Message);
        throw ae;
      }

      return numberOfBytesWritten;
    }

    public int WriteBlocks(int numBytesToWrite)
    {
      // This function writes out chunks at a time instead of the entire file.  This is the fastest write function,
      // perhaps because the block size is an even multiple of the sector size.
      int bytesWritten = 0, bytesToWrite, remainingBytes, bytesOutput = 0;
      byte* pBuf = (byte*)pBuffer;
      remainingBytes = numBytesToWrite;

      // Do until there are no more bytes to write.
      do
      {
        bytesToWrite = Math.Min(remainingBytes, BlockSize);
        if (!WriteFile(handle, pBuf, bytesToWrite, &bytesWritten, 0))
        {
          // This is an error condition.  The error msg can be obtained by creating a Win32Exception and
          // using the Message property to obtain a description of the error that was encountered.
          Win32Exception we = new Win32Exception();
          IOException ae = new IOException("WinFileIO:WriteBlocks - Error occurred writing a file. - "
            + we.Message);
          throw ae;
        }

        pBuf += bytesToWrite;
        bytesOutput += bytesToWrite;
        remainingBytes -= bytesToWrite;
      }
      while (remainingBytes > 0);
      return bytesOutput;
    }

    public bool Close()
    {
      // This function closes the file handle.
      if (!(handle is null || handle.IsInvalid || handle.IsClosed))
      {
        handle.Close();
        return true;
      }

      return false;
    }

    protected void Dispose(bool disposing)
    {
      // This function frees up the unmanaged resources of this class.
      Close();
      UnpinBuffer();
    }

    // Define the Windows system functions that are called by this class via COM Interop:
    [System.Runtime.InteropServices.DllImport("kernel32", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern unsafe SafeFileHandle CreateFile
    (
       string fileName,          // file name
       uint desiredAccess,       // access mode
       uint shareMode,           // share mode
       uint securityAttributes,  // Security Attributes
       uint creationDisposition, // how to create
       uint flagsAndAttributes,  // file attributes
       int hTemplateFile);         // handle to template file

    [System.Runtime.InteropServices.DllImport("kernel32", SetLastError = true)]
    static extern unsafe bool ReadFile
    (
       SafeHandle handle,         // handle to file
       void* pBuffer,            // data buffer
       int numberOfBytesToRead,  // number of bytes to read
       int* pNumberOfBytesRead,  // number of bytes read
       int overlapped);            // overlapped buffer which is used for async I/O.  Not used here.

    [System.Runtime.InteropServices.DllImport("kernel32", SetLastError = true)]
    static extern unsafe bool WriteFile
    (
      SafeHandle handle,               // handle to file
      void* pBuffer,             // data buffer
      int numberOfBytesToWrite,  // Number of bytes to write.
      int* pNumberOfBytesWritten, // Number of bytes that were written..
      int overlapped);                     // Overlapped buffer which is used for async I/O.  Not used here.

    [System.Runtime.InteropServices.DllImport("kernel32", SetLastError = true)]
    static extern unsafe bool CloseHandle
    (
       System.IntPtr hObject);     // handle to object
  }
}
