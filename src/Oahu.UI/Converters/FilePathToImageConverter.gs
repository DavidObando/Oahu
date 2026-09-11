package Oahu.Core.UI.Avalonia.Converters

import Avalonia.Data.Converters
import Avalonia.Media.Imaging
import System
import System.Globalization
import System.IO

class FilePathToImageConverter : IValueConverter {
    func Convert(value object, targetType Type, parameter object, culture CultureInfo) object? {
        if value is string path && !string.IsNullOrEmpty(path) && File.Exists(path) {
            try {
                return Bitmap(path)
            } catch {
                return nil
            }
        }
        return nil
    }

    func ConvertBack(value object, targetType Type, parameter object, culture CultureInfo) object {
        throw NotSupportedException()
    }

    shared {
        let Instance FilePathToImageConverter = FilePathToImageConverter()
    }
}
