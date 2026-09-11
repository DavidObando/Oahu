package Oahu.Cli.Commands

import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Core
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Paths
import Oahu.Cli.App.Queue
import System
import System.IO
import SystemObject = System.Object

/// Service-resolution seam for the auth/library/job commands.
///
/// 4b.1 wired both to the in-memory (cref:FakeAuthService) /
/// (cref:FakeLibraryService). 4b.2 swaps the defaults to the
/// Core-backed wrappers ((cref:CoreAuthService) /
/// (cref:CoreLibraryService)) that talk to `Oahu.Core.AudibleClient`
/// against the GUI-shared profile config and library cache. 4c.1 adds
/// (cref:JobServiceFactory) backed by (cref:JobScheduler) +
/// (cref:AudibleJobExecutor). Tests override the factories to inject
/// seeded fakes.
class CliServiceFactory {
    shared {
        private let Lock object = SystemObject()
        private var authSingleton IAuthService?
        private var librarySingleton ILibraryService?
        private var jobSingleton IJobService?
        private var queueSingleton IQueueService?
        private var configSingleton IConfigService?

        private var _authServiceFactory() -> IAuthService = () -> {
            lock Lock {
                return (
                    if authSingleton == nil {
                        (authSingleton = CoreAuthService())
                    } else {
                        authSingleton
                    }
                )!!
            }
        }

        prop AuthServiceFactory() -> IAuthService {
            get {
                return _authServiceFactory
            }
            set {
                _authServiceFactory = value
            }
        }

        private var _libraryServiceFactory() -> ILibraryService = () -> {
            lock Lock {
                return (
                    if librarySingleton == nil {
                        (librarySingleton = CoreLibraryService())
                    } else {
                        librarySingleton
                    }
                )!!
            }
        }

        prop LibraryServiceFactory() -> ILibraryService {
            get {
                return _libraryServiceFactory
            }
            set {
                _libraryServiceFactory = value
            }
        }

        private var _configServiceFactory() -> IConfigService = () -> {
            lock Lock {
                if configSingleton != nil {
                    return configSingleton!!
                }
                CliPaths.EnsureDirectories()
                configSingleton = JsonConfigService(CliPaths.ConfigFile)
                return configSingleton!!
            }
        }

        prop ConfigServiceFactory() -> IConfigService {
            get {
                return _configServiceFactory
            }
            set {
                _configServiceFactory = value
            }
        }

        /// Per-invocation override for (cref:JobScheduler) parallelism.
        /// Set <i>before</i> the first call to (cref:JobServiceFactory) resolves
        /// the singleton (e.g. by a command's SetAction handler before invoking
        /// `RunAsync`). Reset by (cref:Reset).
        prop OverrideMaxParallelism int32?

        /// Resolves the process-singleton (cref:IJobService). Default:
        /// (cref:JobScheduler) with (cref:AudibleJobExecutor) and a
        /// (cref:JsonlHistoryStore) at the same `history.jsonl` path
        /// the `history` command reads from. Tests override this factory to
        /// inject `FakeJobExecutor`.
        private var _jobServiceFactory() -> IJobService = () -> {
            lock Lock {
                if jobSingleton != nil {
                    return jobSingleton!!
                }
                let historyPath = Path.Combine(CliPaths.SharedUserDataDir, "history.jsonl")
                Directory.CreateDirectory(Path.GetDirectoryName(historyPath)!!)
                let history = JsonlHistoryStore(historyPath)
                let activeJobsPath = Path.Combine(CliPaths.SharedUserDataDir, "active-jobs.json")
                let options = JobSchedulerOptions{
                    MaxParallelism: OverrideMaxParallelism ?? 1,
                    ActiveJobsStatePath: activeJobsPath
                }
                jobSingleton = JobScheduler(AudibleJobExecutor(), history, options)
                return jobSingleton!!
            }
        }

        prop JobServiceFactory() -> IJobService {
            get {
                return _jobServiceFactory
            }
            set {
                _jobServiceFactory = value
            }
        }

        /// Resolves the process-singleton (cref:IQueueService). Default:
        /// (cref:JsonFileQueueService) at `<SharedUserDataDir>/queue.json`
        /// (shared with the GUI per design §7). Tests override this factory to inject
        /// (cref:InMemoryQueueService).
        private var _queueServiceFactory() -> IQueueService = () -> {
            lock Lock {
                if queueSingleton != nil {
                    return queueSingleton!!
                }
                let path = Path.Combine(CliPaths.SharedUserDataDir, "queue.json")
                Directory.CreateDirectory(Path.GetDirectoryName(path)!!)
                queueSingleton = JsonFileQueueService(path)
                return queueSingleton!!
            }
        }

        prop QueueServiceFactory() -> IQueueService {
            get {
                return _queueServiceFactory
            }
            set {
                _queueServiceFactory = value
            }
        }

        /// Test hook: drop cached singletons so the next resolve produces a fresh instance.
        func Reset() {
            lock Lock {
                authSingleton = nil
                librarySingleton = nil
                queueSingleton = nil
                if jobSingleton is IAsyncDisposable iad {
                    let _ = iad.DisposeAsync().AsTask()
                }
                jobSingleton = nil
                configSingleton = nil
                OverrideMaxParallelism = nil
            }
        }
    }
}
