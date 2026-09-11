package Oahu.Cli.Tui.Shell

import Spectre.Console.Rendering
import System

/// A single active modal overlay. The AppShell routes all key input to the
/// active modal before the tab screen. When (cref:IsComplete) becomes
/// true the shell removes the modal and acts on the result.
interface IModal {
    /// Render the modal body (shown in the content area, replacing the tab screen).
    func Render(width int32, height int32) IRenderable;

    /// Handle a key press. Return true if consumed.
    func HandleKey(key ConsoleKeyInfo) bool;
    /// True when the modal has finished (user submitted or cancelled).
    prop IsComplete bool {
        get;
    }

    /// True when the user cancelled (Esc). False when the user submitted a result.
    prop WasCancelled bool {
        get;
    }
}

/// A modal that produces a typed result.
interface IModal[T] : Oahu.Cli.Tui.Shell.IModal {
    /// The result produced by the modal (valid only when (cref:IModal.IsComplete) and not cancelled).
    prop Result T? {
        get;
    }
}
