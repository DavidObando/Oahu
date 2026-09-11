package Oahu.App.Avalonia

import System.Threading
import Avalonia.Controls
import Avalonia.Threading
import Oahu.Aux

/// macOS implementation of IInteractionCallback using Avalonia message boxes.
/// Bridges the business logic interaction pattern to Avalonia dialog windows.
class InteractionCallbackMac[T InteractionMessage] : IInteractionCallback[T, bool?] {
    private let owner Window

    init(owner Window) {
        this.owner = owner
    }

    private enum MessageBoxButtons {
        Ok,
        OkCancel,
        YesNo,
        YesNoCancel
    }

    func Interact(value T) bool? {
        var result bool? = nil
        // Marshal to UI thread if needed
        if Dispatcher.UIThread.CheckAccess() {
            result = ShowDialog(value)
        } else {
            Dispatcher
                .UIThread
                .InvokeAsync(
                () -> {
                    result = ShowDialog(value)
                }
            )
                .Wait()
        }
        return result
    }

    private func ShowDialog(message InteractionMessage) bool? {
        // Map callback types to appropriate dialog styles
        let (title, buttons) = switch message.Type {
            case ECallbackType.Info: ("Information", MessageBoxButtons.Ok)
            case ECallbackType.InfoCancel: ("Information", MessageBoxButtons.OkCancel)
            case ECallbackType.Warning: ("Warning", MessageBoxButtons.Ok)
            case ECallbackType.Error: ("Error", MessageBoxButtons.Ok)
            case ECallbackType.ErrorQuestion: ("Error", MessageBoxButtons.YesNo)
            case ECallbackType.ErrorQuestion3: ("Error", MessageBoxButtons.YesNoCancel)
            case ECallbackType.Question: ("Question", MessageBoxButtons.YesNo)
            case ECallbackType.Question3: ("Question", MessageBoxButtons.YesNoCancel)
            default: ("Message", MessageBoxButtons.Ok)
        }
        // For now, use a simple approach — log the message.
        // Full implementation would show an Avalonia dialog window.
        Logging.Log(1, this, () -> "[$title] ${message.Message}")
        // Default behavior: info/warning/error → true, questions → true (yes)
        return switch message.Type {
            case ECallbackType.Question or
                ECallbackType.Question3 or
                ECallbackType.ErrorQuestion or
                ECallbackType.ErrorQuestion3: true
            default: true
        }
    }
}
