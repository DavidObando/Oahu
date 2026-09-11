package Oahu.Core.UI.Avalonia.Converters

import Avalonia.Data.Converters
import System
import System.Globalization

/// Converts an integer step index to a visibility boolean based on whether
/// it matches the converter parameter.
class StepVisibilityConverter : IValueConverter {
    func Convert(value object, targetType Type, parameter object, culture CultureInfo) object {
        if value is int32 currentStep && parameter is string paramStr && int32.TryParse(paramStr, out var targetStep) {
            return currentStep == targetStep
        }
        return false
    }

    func ConvertBack(value object, targetType Type, parameter object, culture CultureInfo) object {
        throw NotSupportedException()
    }
}

/// Converts a 0-based step index to a 1-based display number.
class OneBasedConverter : IValueConverter {
    func Convert(value object, targetType Type, parameter object, culture CultureInfo) object {
        if value is int32 step {
            return step + 1
        }
        return value
    }

    func ConvertBack(value object, targetType Type, parameter object, culture CultureInfo) object {
        throw NotSupportedException()
    }
}
