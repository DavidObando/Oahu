package Oahu.SystemManagement

import Oahu.CommonTypes

class WinHardwareIdProvider : IHardwareIdProvider {
    func GetCpuId() string? -> HardwareId.GetCpuId()

    func GetMotherboardId() string? -> HardwareId.GetMotherboardId()

    func GetMotherboardPnpDeviceId() string? -> MotherboardInfo.PNPDeviceID

    func GetDiskId() string? -> HardwareId.GetDiskId()
}
