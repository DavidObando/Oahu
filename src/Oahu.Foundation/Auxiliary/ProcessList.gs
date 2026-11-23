package Oahu.Aux

import System
import System.Collections.Generic
import System.Diagnostics
import SystemObject = System.Object

class ProcessList : IDisposable, IProcessList {
    private let lockable object = SystemObject()
    private var disposed bool = false
    private var processes HashSet[Process] = HashSet[Process]()

    prop Notify IProcessList? {
        private get;
        set;
    }

    func Add(process Process) bool {
        lock lockable {
            if disposed {
                try {
                    process.Kill()
                } catch (InvalidOperationException) {
                    // Already exited or never started.
                }
                throw ObjectDisposedException("ProcessList")
            }
            Notify?.Add(process)
            return processes.Add(process)
        }
    }

    func Remove(process Process) bool {
        Notify?.Remove(process)
        lock lockable {
            return processes.Remove(process)
        }
    }

    func Dispose() {
        Dispose(true)
        GC.SuppressFinalize(this)
    }

    private func Dispose(disposing bool) {
        lock lockable {
            if disposed {
                return
            }
            disposed = true
            for p in processes {
                try {
                    p.Kill()
                } catch (InvalidOperationException) {
                    // Already exited or never started.
                }
            }
            processes.Clear()
        }
    }
}
