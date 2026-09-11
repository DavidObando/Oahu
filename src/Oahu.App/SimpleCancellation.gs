package Oahu.App.Avalonia

import Oahu.Core
import System.Threading

/// Minimal implementation of (cref:ICancellation) for use with
/// (cref:DownloadDecryptJob{T}).
class SimpleCancellation : ICancellation {
    init(token CancellationToken) {
        CancellationToken = token
    }

    prop CancellationToken CancellationToken {
        get;
        init;
    }
}
