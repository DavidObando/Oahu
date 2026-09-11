package Oahu.SystemManagement

import System
import System.Management

/// http://jai-on-asp.blogspot.com/2010/03/finding-hardware-id-of-computer.html
class HardwareId {
    shared {
        func GetCpuId() string? {
            // ManagementObjectCollection mbsList = null;
            try {
                let mbs = ManagementObjectSearcher("Select * From Win32_processor")
                let mbsList = mbs.Get()!!
                var id string? = string.Empty
                for mo ManagementObject in mbsList {
                    id = mo["ProcessorID"]!!.ToString()
                }
                return id
            } catch (Exception) {
                return string.Empty
            }
        }

        func GetDiskId() string? {
            try {
                let dsk = ManagementObject("win32_logicaldisk.deviceid=\"c:\"")
                dsk.Get()
                let id string? = dsk["VolumeSerialNumber"]!!.ToString()
                return id
            } catch (Exception) {
                return string.Empty
            }
        }

        func GetMotherboardId() string? {
            return MotherboardInfo.SerialNumber
        }
    }
}
