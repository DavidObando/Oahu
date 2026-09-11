import System
import System.Management

/// https://ourcodeworld.com/articles/read/314/how-to-retrieve-the-motherboard-information-with-c-sharp-in-winforms
class MotherboardInfo {
    shared {
        private var baseboardSearcher ManagementObjectSearcher = ManagementObjectSearcher(
            "root\\CIMV2",
            "SELECT * FROM Win32_BaseBoard"
        )
        private var motherboardSearcher ManagementObjectSearcher = ManagementObjectSearcher(
            "root\\CIMV2",
            "SELECT * FROM Win32_MotherboardDevice"
        )

        prop Availability string {
            get {
                try {
                    for queryObj ManagementObject in motherboardSearcher.Get()!! {
                        return GetAvailability(int32.Parse((queryObj["Availability"]?.ToString())!!))
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop HostingBoard bool {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        if queryObj["HostingBoard"]?.ToString() == "True" {
                            return true
                        } else {
                            return false
                        }
                    }
                    return false
                } catch (Exception) {
                    return false
                }
            }
        }

        prop InstallDate string? {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        return ConvertToDateTime(queryObj["InstallDate"]?.ToString())
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop Manufacturer string? {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        return queryObj["Manufacturer"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop Model string? {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        return queryObj["Model"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop PartNumber string? {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        return queryObj["PartNumber"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop PNPDeviceID string? {
            get {
                try {
                    for queryObj ManagementObject in motherboardSearcher.Get()!! {
                        return queryObj["PNPDeviceID"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop PrimaryBusType string? {
            get {
                try {
                    for queryObj ManagementObject in motherboardSearcher.Get()!! {
                        return queryObj["PrimaryBusType"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop Product string? {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        return queryObj["Product"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop Removable bool {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        if queryObj["Removable"]?.ToString() == "True" {
                            return true
                        } else {
                            return false
                        }
                    }
                    return false
                } catch (Exception) {
                    return false
                }
            }
        }

        prop Replaceable bool {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        if queryObj["Replaceable"]?.ToString() == "True" {
                            return true
                        } else {
                            return false
                        }
                    }
                    return false
                } catch (Exception) {
                    return false
                }
            }
        }

        prop RevisionNumber string? {
            get {
                try {
                    for queryObj ManagementObject in motherboardSearcher.Get()!! {
                        return queryObj["RevisionNumber"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop SecondaryBusType string? {
            get {
                try {
                    for queryObj ManagementObject in motherboardSearcher.Get()!! {
                        return queryObj["SecondaryBusType"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop SerialNumber string? {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        return queryObj["SerialNumber"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop Status string? {
            get {
                try {
                    for querObj ManagementObject in baseboardSearcher.Get()!! {
                        return querObj["Status"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop SystemName string? {
            get {
                try {
                    for queryObj ManagementObject in motherboardSearcher.Get()!! {
                        return queryObj["SystemName"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        prop Version string? {
            get {
                try {
                    for queryObj ManagementObject in baseboardSearcher.Get()!! {
                        return queryObj["Version"]?.ToString()
                    }
                    return string.Empty
                } catch (Exception) {
                    return string.Empty
                }
            }
        }

        private func GetAvailability(availability int32) string {
            switch availability {
                case 1 {
                    return "Other"
                }
                case 2 {
                    return "Unknown"
                }
                case 3 {
                    return "Running or Full Power"
                }
                case 4 {
                    return "Warning"
                }
                case 5 {
                    return "In Test"
                }
                case 6 {
                    return "Not Applicable"
                }
                case 7 {
                    return "Power Off"
                }
                case 8 {
                    return "Off Line"
                }
                case 9 {
                    return "Off Duty"
                }
                case 10 {
                    return "Degraded"
                }
                case 11 {
                    return "Not Installed"
                }
                case 12 {
                    return "Install Error"
                }
                case 13 {
                    return "Power Save - Unknown"
                }
                case 14 {
                    return "Power Save - Low Power Mode"
                }
                case 15 {
                    return "Power Save - Standby"
                }
                case 16 {
                    return "Power Cycle"
                }
                case 17 {
                    return "Power Save - Warning"
                }
                default {
                    return "Unknown"
                }
            }
        }

        private func ConvertToDateTime(unconvertedTime string?) string? {
            if unconvertedTime == nil {
                return nil
            }
            var convertedTime = string.Empty
            let year = int32.Parse(unconvertedTime.Substring(0, 4))
            let month = int32.Parse(unconvertedTime.Substring(4, 2))
            let date = int32.Parse(unconvertedTime.Substring(6, 2))
            var hours = int32.Parse(unconvertedTime.Substring(8, 2))
            let minutes = int32.Parse(unconvertedTime.Substring(10, 2))
            let seconds = int32.Parse(unconvertedTime.Substring(12, 2))
            var meridian = "AM"
            if hours > 12 {
                hours -= 12
                meridian = "PM"
            }
            convertedTime = (
                date.ToString() + "/" + month.ToString() + "/" + year.ToString() + " " + hours.ToString() +
                    ":" +
                    minutes.ToString() + ":" + seconds.ToString() + " " + meridian
            )
            return convertedTime
        }
    }
}
