// G# port of src/Oahu.Cli.App/Config/JsonConfigService.cs.
// Uses C# Oahu.Cli.App.AtomicFile for the actual file I/O so we don't have to
// re-implement generic JSON read/write in G# (whose user-defined generic
// methods don't yet preserve their type-parameters at runtime).

package Oahu.Cli.App.Experiment.Config

import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App
import Oahu.Cli.App.Models

type ExpJsonConfigService class : IExpConfigService {
    FilePath string = ""
    writeLock object = Object()

    func LoadAsync(cancellationToken CancellationToken) Task[OahuConfig] {
        cancellationToken.ThrowIfCancellationRequested()
        let loaded = AtomicFile.ReadJson[OahuConfig](FilePath, nil)
        return Task.FromResult(loaded ?: OahuConfig.Default)
    }

    func SaveAsync(config OahuConfig, cancellationToken CancellationToken) Task {
        cancellationToken.ThrowIfCancellationRequested()
        Monitor.Enter(writeLock)
        try {
            AtomicFile.WriteAllJson[OahuConfig](FilePath, config, nil)
        } finally {
            Monitor.Exit(writeLock)
        }
        return Task.CompletedTask
    }

    func Path() string {
        return FilePath
    }
}
