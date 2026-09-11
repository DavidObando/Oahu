package Oahu.Cli.App.Jobs

import Oahu.Core
import System.Threading

/// CLI-side (cref:ICancellation) for `DownloadDecryptJob<T>`.
/// Mirrors `Oahu.App.Avalonia.SimpleCancellation` so the CLI does not
/// reference the Avalonia GUI assembly.
class CliCancellation : ICancellation {
    init(token CancellationToken) {
        CancellationToken = token
    }

    prop CancellationToken CancellationToken {
        get;
        init;
    }
}
