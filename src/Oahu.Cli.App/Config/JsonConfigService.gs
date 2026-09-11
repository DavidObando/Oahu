package Oahu.Cli.App.Config

import Oahu.Cli.App
import Oahu.Cli.App.Models
import System.Threading
import System.Threading.Tasks
import SystemObject = System.Object

/// JSON-on-disk implementation of (cref:IConfigService). Atomic writes via (cref:AtomicFile).
class JsonConfigService : IConfigService {
    private let path string
    private let writeLock object = SystemObject()

    init(path string) {
        this.path = path
    }

    prop Path string -> path

    func LoadAsync(cancellationToken CancellationToken = default(CancellationToken)) Task[OahuConfig] {
        cancellationToken.ThrowIfCancellationRequested()
        let loaded = AtomicFile.ReadJson[OahuConfig](path)
        return Task.FromResult(loaded ?? OahuConfig.Default)
    }

    func SaveAsync(config OahuConfig, cancellationToken CancellationToken = default(CancellationToken)) Task {
        cancellationToken.ThrowIfCancellationRequested()
        lock writeLock {
            AtomicFile.WriteAllJson(path, config)
        }
        return Task.CompletedTask
    }
}
