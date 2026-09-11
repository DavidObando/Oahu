package Oahu.Cli.App.Models

import System

/// Audible region the user is signed in against.
enum CliRegion {
    Us,
    Uk,
    De,
    Fr,
    It,
    Es,
    Jp,
    Au,
    Ca,
    In,
    Br
}

/// One signed-in profile, as visible from the CLI boundary.
data class AuthSession {
    prop ProfileAlias string {
        get;
        init;
    }

    prop Region CliRegion {
        get;
        init;
    }

    prop AccountId string {
        get;
        init;
    }

    prop AccountName string? {
        get;
        init;
    }

    prop DeviceName string? {
        get;
        init;
    }

    /// UTC instant the access token expires.
    prop ExpiresAt DateTimeOffset? {
        get;
        init;
    }

    prop IsExpired bool -> ExpiresAt is {} e && e <= DateTimeOffset.UtcNow
}
