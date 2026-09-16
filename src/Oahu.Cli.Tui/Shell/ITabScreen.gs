package Oahu.Cli.Tui.Shell

import Oahu.Cli.Tui.Auth
import Spectre.Console.Rendering
import System
import System.Collections.Generic
import System.Threading.Tasks

/// Contract for a tab inside (cref:AppShell). Phase 6 ships
/// placeholder implementations; phases 7–8 replace them with real screens.
interface ITabScreen {
    /// Display title in the tab strip (e.g. "Home", "Library").
    prop Title string {
        get;
    }

    /// The numeric jump key (e.g. `'1'` for Home).
    prop NumberKey char {
        get;
    }

    /// Build the body renderable for the current size. The shell already
    /// renders the chrome (header / tabs / hint bar); the screen owns
    /// only the inside of the body box.
    func Render(width int32, height int32) IRenderable;

    /// Handle a key the shell did not handle as a global. Return true to
    /// signal that the screen consumed the key (the shell skips its own
    /// fallback handlers).
    func HandleKey(key ConsoleKeyInfo) bool;
    /// Hints contributed by this screen (mixed into the global hint bar).
    prop Hints IEnumerable[KeyValuePair[string, string?]] {
        get;
    }

    /// True when the screen wants the shell to re-render on a 100 ms tick
    /// even while no key has been pressed (e.g. JobsScreen observing live
    /// updates, or a mutation spinner). The shell also ticks automatically
    /// while a shell-managed load task is pending, so screens do not need
    /// to return `true` for activation loads.
    prop NeedsTimedRefresh bool -> false

    /// Called when this tab becomes the active one (default: no-op).
    func OnActivated(navigator IAppShellNavigator) { }

    /// Async activation hook. The shell calls this instead of
    /// (cref:OnActivated) when switching tabs. Return a non-null
    /// (cref:Task) to indicate that data is loading; the shell
    /// renders a loading spinner and guarantees timed refresh until the
    /// task completes (and one frame after). The default implementation
    /// delegates to (cref:OnActivated) and returns `null`.
    func OnActivatedAsync(navigator IAppShellNavigator) Task? {
        OnActivated(navigator)
        return nil
    }

    /// Called when this tab is no longer the active one (default: no-op).
    func OnDeactivated() { }

    /// Called once when the shell is shutting down (default: no-op).
    func OnShutdown() { }

    /// Mouse wheel over the body: [`delta`](paramref) is signed lines
    /// (positive = towards newer/lower content). Return true if consumed.
    /// Default: no-op.
    func HandleScroll(delta int32) bool {
        return false
    }

    /// Left click in the body at screen-relative cell coordinates (0-based;
    /// the shell has already subtracted the chrome offsets). Return true if
    /// consumed. Default: no-op.
    func HandleClick(x int32, y int32) bool {
        return false
    }
}

/// Optional shell-side service exposed to screens for tab navigation, modal
/// presentation, and toast notifications. Implemented by (cref:AppShell).
interface IAppShellNavigator {
    /// Switch to the tab whose (cref:ITabScreen.NumberKey) matches.
    func SwitchToTab(numberKey char);

    /// Show a modal overlay; routes keys until the modal completes.
    func ShowModal(modal IModal);

    /// Show a transient one-line toast (warning style).
    func ShowToast(message string);
    /// The modal currently shown by the shell, or null when none.
    prop ActiveModal IModal? {
        get;
    }

    /// Dismiss the active modal, if any.
    func DismissModal();

    /// Attach (or detach with `null`) the broker the shell polls for
    /// modal-request callbacks raised by background auth operations.
    func SetBroker(broker TuiCallbackBroker?);

    /// Ask the shell to track a background load task (e.g. a screen-initiated
    /// reload via F5). The shell renders a loading spinner and guarantees
    /// timed refresh until the task completes. Replaces any previously
    /// tracked load for the active screen.
    func TrackLoad(loadTask Task);
}

/// Optional capability for screens that want to drive the terminal's
/// title-bar / dock progress indicator (OSC 9;4). The shell queries the
/// active screen each frame and appends the returned escape sequence to
/// the same atomic write as the rendered frame.
interface ITerminalProgressProvider {
    /// Return the current OSC 9;4 sequence to emit (e.g. `"\e]9;4;1;42\e\\"`),
    /// or null to emit nothing this frame. Return the clear sequence
    /// (`"\e]9;4;0;0\e\\"`) to remove the indicator.
    func GetTerminalProgressSequence() string?;
}
