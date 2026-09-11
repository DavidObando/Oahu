package Oahu.Cli.Commands

/// Globally-applicable flags resolved from the root command and made available
/// to every subcommand.
class GlobalOptions {
    prop Quiet bool {
        get;
        init;
    }

    prop Verbose bool {
        get;
        init;
    }

    prop Force bool {
        get;
        init;
    }

    prop DryRun bool {
        get;
        init;
    }

    prop ForceNoColor bool {
        get;
        init;
    }

    prop UseAscii bool {
        get;
        init;
    }

    prop ConfigDirOverride string? {
        get;
        init;
    }

    prop LogDirOverride string? {
        get;
        init;
    }

    prop LogLevelOverride string? {
        get;
        init;
    }

    prop Json bool {
        get;
        init;
    }

    prop Plain bool {
        get;
        init;
    }

    /// Optional theme name from the `--theme` root flag. When set it overrides
    /// the persisted `OahuConfig.Theme` for the lifetime of the process.
    prop ThemeOverride string? {
        get;
        init;
    }
}
