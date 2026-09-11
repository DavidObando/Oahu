package Oahu.Aux

import System
import System.Threading

class Temp {
    shared {
        func GetPseudoUniqueString() string {
            let ticks = DateTime.UtcNow.Ticks
            let thrdid = Thread.CurrentThread.ManagedThreadId
            return "${thrdid}_$ticks"
        }
    }
}
