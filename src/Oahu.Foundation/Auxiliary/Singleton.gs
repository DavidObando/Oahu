package Oahu.Aux

import System
import SystemObject = System.Object

/// Implementation of the "Singleton" pattern.
/// @typeparam T Type of class to be instantiated as a singleton.
class Singleton[T class init()] {
    shared {
        private let Lockable object = SystemObject()
        private var instance T?

        /// Get the instance of the singleton.
        /// C#-style implementation as a property.
        /// @value Instance of singleton.
        prop Instance T? {
            get {
                lock Lockable {
                    if instance == nil {
                        instance = T()
                    }
                    return instance!!
                }
            }
        }

        func Dispose() {
            lock Lockable {
                if instance is IDisposable obj {
                    obj.Dispose()
                }
                instance = nil
            }
        }
    }
}
