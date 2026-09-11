package Oahu.Cli.Tui.Shell

import System

/// Mutable state shared across the AppShell chrome and screens.
/// Updated after sign-in, library sync, etc.
class AppShellState {
    /// Display name of the active profile (empty when not signed in).
    private var _profile string = string.Empty

    prop Profile string {
        get {
            return _profile
        }
        set {
            _profile = value
        }
    }

    /// Active Audible region.
    private var _region string = string.Empty

    prop Region string {
        get {
            return _region
        }
        set {
            _region = value
        }
    }

    /// Coalesced activity verb shown in the header ("idle", "syncing…", "2 jobs running").
    private var _activityVerb string = "idle"

    prop ActivityVerb string {
        get {
            return _activityVerb
        }
        set {
            _activityVerb = value
        }
    }

    /// True when at least one profile is signed in.
    prop IsSignedIn bool -> !string.IsNullOrEmpty(Profile)

    /// Monotonic counter incremented whenever the user explicitly asks for a
    /// library refresh (e.g. Home screen 'r'). Library-aware screens compare
    /// against the last value they observed and reload when it changes so a
    /// freshly-purchased title shows up after switching tabs.
    prop LibraryGeneration int32 {
        get;
        private set;
    }

    /// Bump (cref:LibraryGeneration) to signal stale data.
    func InvalidateLibrary() {
        LibraryGeneration++
    }

    /// Formatted header display: "profile@region" or "(not signed in)".
    prop ProfileDisplay string -> if string.IsNullOrEmpty(Profile) {
        "(not signed in)"
    } else {
        (
            if string.IsNullOrEmpty(Region) {
                Profile
            } else {
                "$Profile@$Region"
            }
        )
    }
}
