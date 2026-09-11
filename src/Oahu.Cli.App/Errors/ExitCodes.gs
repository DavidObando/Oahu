package Oahu.Cli.App.Errors

/// Process exit codes used across the oahu-cli surface (per design §10).
/// @remarks Single source of truth — every command/host should return one of these constants
/// instead of magic numbers so that exit-code semantics stay consistent across the
/// codebase and so the design doc remains authoritative.
class ExitCodes {
    shared {
        /// 0 — successful completion.
        const Success int32 = 0

        /// 1 — generic failure (unexpected exception, unspecified runtime error).
        const GenericFailure int32 = 1

        /// 2 — usage error (command-line parse or validation failure).
        const UsageError int32 = 2

        /// 3 — authentication required or failed.
        const AuthError int32 = 3

        /// 4 — Audible API error (HTTP failure from Oahu.Data, etc).
        const AudibleApiError int32 = 4

        /// 5 — decryption / conversion error (Oahu.Decrypt failure).
        const DecryptError int32 = 5

        /// 6 — single-instance lock contention (another oahu-cli already holds the user-data lock).
        const Locked int32 = 6

        /// 130 — cancelled by user (SIGINT / Ctrl+C). Matches POSIX convention.
        const Cancelled int32 = 130
    }
}
