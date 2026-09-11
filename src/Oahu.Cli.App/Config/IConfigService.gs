package Oahu.Cli.App.Config

import Oahu.Cli.App.Models
import System.Threading
import System.Threading.Tasks

/// Loads and persists the user's (cref:OahuConfig). Implementations are thread-safe.
interface IConfigService {
    /// Path to the underlying config file (or "<memory>" for in-memory test impls).
    prop Path string {
        get;
    }

    func LoadAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[OahuConfig];

    func SaveAsync(config OahuConfig, cancellationToken CancellationToken = default(CancellationToken)) Task;
}
