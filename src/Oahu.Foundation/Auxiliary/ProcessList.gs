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
        Notify?.Add(process)
        lock lockable {
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
        if disposed {
            return
        }
        if disposing { }
        lock lockable {
            for p in processes {
                p.Kill()
            }
        }
        disposed = true
    }
}
