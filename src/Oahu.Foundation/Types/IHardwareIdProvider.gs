package Oahu.CommonTypes

interface IHardwareIdProvider {
    func GetCpuId() string;

    func GetMotherboardId() string;

    func GetMotherboardPnpDeviceId() string;

    func GetDiskId() string;
}
