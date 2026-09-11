package Oahu.Aux

import Oahu.Aux.ApplEnv
import Oahu.Aux.Extensions
import System
import System.Collections.Generic
import System.IO
import System.Linq
import System.Runtime.CompilerServices
import System.Threading
import SystemObject = System.Object

class Logging {
    private let lockable object = SystemObject()
    private var instantFlush bool
    private var fullClassNames bool
    private var prettyTypeNameLevel uint32 = uint32(2)
    private var level int32 = -1
    private var currentfilename string?
    private var filecount uint32
    private var filedate DateTime
    private var filestub string
    private var ignoreExisting bool
    private var logStreamWriter StreamWriter?
    private var flushTimer Timer?
    private var linecount uint32
    private var logfileLocationOutputDone bool

    // cannot instatiate from outside class
    private init() {
        SetFileNameStub()
    }

    private prop Writer TextWriter? -> logStreamWriter

    private func SetLevel(value int32) {
        {
            if value >= 0 {
                level = value
                LogInternal("${"Level"}=$level")
            }
        }
    }

    private func Log0(level uint32, caller object, @CallerMemberName method string? = nil) {
        if int64(level) <= int64(this.level) {
            LogInternal(level, Context(caller, method), nil)
        }
    }

    private func Log0(level uint32, caller Type, @CallerMemberName method string? = nil) {
        if int64(level) <= int64(this.level) {
            LogInternal(level, Context(caller, method), nil)
        }
    }

    private func LogInternal(level uint32, caller object, what string, @CallerMemberName method string? = nil) {
        if int64(level) <= int64(this.level) {
            LogInternal(level, Context(caller, method), what)
        }
    }

    private func LogInternal(level uint32, caller Type?, what string, @CallerMemberName method string? = nil) {
        if int64(level) <= int64(this.level) {
            LogInternal(level, Context(caller, method), what)
        }
    }

    private func LogInternal(
        level uint32,
        caller object,
        getWhat(() -> string)?,
        @CallerMemberName method string? = nil
    ) {
        if int64(level) <= int64(this.level) && !(getWhat == nil) {
            LogInternal(level, Context(caller, method), getWhat())
        }
    }

    private func LogInternal(
        level uint32,
        caller Type?,
        getWhat(() -> string)?,
        @CallerMemberName method string? = nil
    ) {
        if int64(level) <= int64(this.level) && !(getWhat == nil) {
            LogInternal(level, Context(caller, method), getWhat())
        }
    }

    private func LogInternal(level uint32, context string, msg string?) {
        if int64(level) <= int64(this.level) {
            LogInternal(context, msg)
        }
    }

    private func LogInternal(msg string) -> LogInternal(nil, msg)

    private func LogInternal(context string?, msg string?) -> HandleWrite(LogMessage(context, msg))

    private func HandleWrite(logMessage LogMessage) {
        EnsureWriter()
        Write(logMessage)
    }

    private func EnsureWriter() {
        // Do we have a stream writer?
        lock lockable {
            if logStreamWriter == nil {
                OpenWriter(true)
            } else {
                if DateTime.Now.Date != filedate.Date {
                    NextWriter(true)
                } else if logStreamWriter!!.BaseStream.Position >= FileSize {
                    NextWriter(false)
                }
            }
        }
    }

    private func NextWriter(newDay bool) {
        Close()
        OpenWriter(newDay)
    }

    private func Close() {
        CloseFlushTimer()
        CloseWriter()
    }

    private func CloseFlushTimer() {
        if flushTimer != nil {
            flushTimer!!.Dispose()
        }
        flushTimer = nil
    }

    private func CloseWriter() {
        if !(logStreamWriter == nil) {
            logStreamWriter!!.Dispose()
        }
        logStreamWriter = nil
    }

    private func OpenWriter(newDay bool) {
        if newDay {
            filedate = DateTime.Today.Date
            filecount = uint32(0)
            ignoreExisting = false
        }
        let stub = "${filestub}_${filedate:yyyy-MM-dd}_"
        let ext = EXT
        let filenames IEnumerable[string]? = GetExisting(stub)
        var filename string? = nil
        while true {
            // next file, theoretically
            filecount++
            // build a filename
            filename = "$stub${filecount:000}$ext"
            let exists = filenames?.Where((n string) -> filename!!.ToLower().IndexOf(n) >= 0).Any() ?? false
            if exists && !ignoreExisting {
                if filecount < uint32(1000) {
                    continue
                }
                ignoreExisting = true
                filecount = uint32(1)
            }
            let succ = OpenWriter(filename)
            if succ {
                break
            }
        }
        if !logfileLocationOutputDone {
            logfileLocationOutputDone = true
            Console.WriteLine("${typeof(Logging).Name} written to \"$filename\".")
        }
    }

    private func GetExisting(stub string) IEnumerable[string]? {
        let folder string? = Path.GetDirectoryName(stub)
        if !Directory.Exists(folder) {
            return nil
        }
        let filestub = Path.GetFileNameWithoutExtension(stub)
        let search = "$filestub*$EXT"
        let files = Directory.GetFiles(folder, search)
        let names = files.Select((f string) -> Path.GetFileName(f.ToLower()))
        return names
    }

    private func OpenWriter(filename string?) bool {
        var filename = filename
        let createOption = if ignoreExisting {
            FileMode.Create
        } else {
            FileMode.CreateNew
        }
        var folder string? = Path.GetDirectoryName(filename)
        filename = Path.GetFileName(filename)
        if string.IsNullOrEmpty(folder) {
            folder = LogDirectory
        }
        filename = Path.Combine(folder, filename!!)
        Directory.CreateDirectory(folder)
        let stream Stream = FileStream(filename, createOption, FileAccess.ReadWrite)
        logStreamWriter = StreamWriter(stream)
        currentfilename = filename
        if !InstantFlush {
            OpenFlushTimer()
        }
        return true
    }

    private func OpenFlushTimer() {
        flushTimer = Timer(FlushTimerCallback, nil, 5000, 5000)
    }

    private func Write(msg LogMessage) {
        let s = Format(msg)
        lock lockable {
            Writer!!.WriteLine(s)
            if InstantFlush {
                Writer!!.Flush()
            } else {
                linecount++
            }
        }
    }

    private func FlushTimerCallback(state object) {
        lock lockable {
            if linecount > uint32(0) {
                Writer!!.Flush()
            }
            linecount = uint32(0)
        }
    }

    private func SetFileNameStub() {
        filecount = uint32(0)
        filedate = DateTime.Today
        filestub = Path.Combine(LogDirectory, ApplName!!)
    }

    private class LogMessage {
        convenience init(message string) {
            init(nil, message)
        }

        convenience init(context string?, message string?) {
            init(DateTime.Now, Thread.CurrentThread.ManagedThreadId, context, message)
        }

        init(timestamp DateTime, threadId int32, context string?, message string?) {
            DateTime = timestamp
            ThreadId = threadId
            Context = context
            Message = message
        }

        prop DateTime DateTime {
            get;
            private set;
        }

        prop ThreadId int32 {
            get;
            private set;
        }

        prop Context string? {
            get;
            private set;
        }

        prop Message string? {
            get;
            private set;
        }
    }

    shared {
        const DefaultFileSize int64 = 20 * 1024 * 1024
        private const EXT string = ".log"

        prop Level int32 {
            get -> Instance.level
            set -> Instance.SetLevel(value)
        }

        prop InstantFlush bool {
            get -> Instance.instantFlush
            set -> Instance.instantFlush = value
        }

        prop FullClassNames bool {
            get -> Instance.fullClassNames
            set -> Instance.fullClassNames = value
        }

        prop PrettyTypeNameLevel uint32 {
            get -> Instance.prettyTypeNameLevel
            set -> Instance.prettyTypeNameLevel = value
        }

        private let _instance Logging = Logging()

        private prop Instance Logging {
            get {
                return _instance
            }
        }

        private prop FileSize int64 -> DefaultFileSize
        func Log(level uint32, caller object, @CallerMemberName method string? = nil) -> Instance.Log0(
            level,
            caller,
            method
        )

        func Log(level uint32, caller Type, @CallerMemberName method string? = nil) -> Instance.Log0(
            level,
            caller,
            method
        )

        func Log(
            level uint32,
            caller object,
            what string,
            @CallerMemberName method string? = nil
        ) -> Instance.LogInternal(level, caller, what, method)

        func Log(
            level uint32,
            caller Type?,
            what string,
            @CallerMemberName method string? = nil
        ) -> Instance.LogInternal(level, caller, what, method)

        func Log(
            level uint32,
            caller object,
            getWhat(() -> string)?,
            @CallerMemberName method string? = nil
        ) -> Instance.LogInternal(level, caller, getWhat, method)

        func Log(
            level uint32,
            caller Type?,
            getWhat(() -> string)?,
            @CallerMemberName method string? = nil
        ) -> Instance.LogInternal(level, caller, getWhat, method)

        // public static void Log (uint level, string msg) => Log (level, null, msg);
        // public static void Log (uint level, string context, string msg) => Instance.log (level, context, msg);
        private func Context(caller object, method string?) string -> Context(caller.GetType(), method)

        // private static string context (string method) => $"???.{method}";
        private func Context(caller Type?, method string?) string {
            let typename string? = caller.PrettyName(int32(PrettyTypeNameLevel), FullClassNames)
            return "$typename.$method"
        }

        private func Format(msg LogMessage) string {
            let ctx = if string.IsNullOrWhiteSpace(msg.Context) {
                string.Empty
            } else {
                "[${msg.Context}] "
            }
            let s = "${msg.DateTime:HH:mm:ss.fff} ${msg.ThreadId:0000} $ctx${msg.Message}"
            return s
        }
    }
}
