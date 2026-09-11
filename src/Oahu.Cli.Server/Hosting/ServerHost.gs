package Oahu.Cli.Server.Hosting

import System
import System.IO
import System.Threading
import System.Threading.Tasks
import Microsoft.AspNetCore.Builder
import Microsoft.AspNetCore.Hosting
import Microsoft.AspNetCore.Server.Kestrel.Core
import Microsoft.Extensions.DependencyInjection
import Microsoft.Extensions.Hosting
import Microsoft.Extensions.Logging
import ModelContextProtocol.Server
import Oahu.Cli.App.Auth
import Oahu.Cli.App.Config
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Library
import Oahu.Cli.App.Queue
import Oahu.Cli.Server.Audit
import Oahu.Cli.Server.Auth
import Oahu.Cli.Server.Capabilities
import Oahu.Cli.Server.Tools
import System.Net
import System.Net.Sockets

/// Entry-point for `oahu-cli serve`. Hosts the MCP-stdio server, the loopback
/// HTTP REST server, or both, depending on (cref:ServerOptions).
///
/// Service factories default to whatever `Oahu.Cli.Commands.CliServiceFactory`
/// returns; tests inject fakes via the same seam (see (cref:ServiceFactories)).
///
/// CRITICAL: under stdio MCP, stdout is owned by the JSON-RPC channel. All ASP.NET
/// Core / hosting / our own diagnostics must go to `stderr` or be silenced.
/// We force this when (cref:ServerOptions.EnableStdio) is true.
class ServerHost {
    /// Override-able service factories. Production code lets these resolve via the
    /// `CliServiceFactory` static accessors (configured by `oahu-cli`'s
    /// `Program.Main`); tests can swap them out wholesale.
    class ServiceFactories {
        init() {
            Auth = () -> throw InvalidOperationException("AuthFactory not configured")
            Library = () -> throw InvalidOperationException("LibraryFactory not configured")
            Queue = () -> throw InvalidOperationException("QueueFactory not configured")
            Job = () -> throw InvalidOperationException("JobFactory not configured")
            Config = () -> throw InvalidOperationException("ConfigFactory not configured")
            Doctor = () -> throw InvalidOperationException("DoctorFactory not configured")
        }

        prop Auth() -> IAuthService {
            get;
            init;
        }

        prop Library() -> ILibraryService {
            get;
            init;
        }

        prop Queue() -> IQueueService {
            get;
            init;
        }

        prop Job() -> IJobService {
            get;
            init;
        }

        prop Config() -> IConfigService {
            get;
            init;
        }

        prop Doctor() -> IDoctorService {
            get;
            init;
        }
    }

    private class StderrLoggerProvider : ILoggerProvider {
        func CreateLogger(categoryName string) ILogger -> StderrLogger(categoryName)

        func Dispose() { }

        private class StderrLogger : ILogger {
            private let category string

            init(category string) {
                this.category = category
            }

            func BeginScope[TState](state TState) IDisposable? -> nil

            func IsEnabled(logLevel LogLevel) bool -> logLevel >= LogLevel.Warning

            func Log[TState](
                logLevel LogLevel,
                eventId EventId,
                state TState,
                exception Exception?,
                formatter(TState, Exception?) -> string
            ) {
                if !IsEnabled(logLevel) {
                    return
                }
                let msg = formatter(state, exception)
                Console.Error.WriteLine("[$logLevel] $category: $msg")
                if exception != nil {
                    Console.Error.WriteLine(exception)
                }
            }
        }
    }

    shared {
        /// Build a (cref:WebApplication) ready to be started. Public so tests can
        /// construct it without going through (cref:RunAsync).
        func BuildHttpApp(options ServerOptions, factories ServiceFactories) WebApplication {
            let useUnix = !string.IsNullOrEmpty(options.UnixSocketPath)
            if useUnix && OperatingSystem.IsWindows() {
                throw PlatformNotSupportedException(
                    "oahu-cli serve --listen unix:<path> is not supported on Windows. Use TCP loopback instead."
                )
            }
            // Validate loopback constraint up front for the TCP path; for the
            // Unix-socket path we skip the bind-address check entirely.
            let bindAddr = if useUnix {
                default(IPAddress?)
            } else {
                options.ResolveBindAddress()
            }
            let builder = WebApplication.CreateSlimBuilder()
            // Quiet ASP.NET Core (avoid corrupting stdout when sharing with stdio MCP).
            if options.EnableStdio {
                builder.Logging.ClearProviders()
                builder.Logging.AddProvider(StderrLoggerProvider())
            } else {
                builder.Logging.ClearProviders()
                builder.Logging.AddSimpleConsole()
            }
            if useUnix {
                // Remove any stale socket file from a previous run; the server owns
                // this path while it holds the user-data lock.
                try {
                    if File.Exists(options.UnixSocketPath!!) {
                        File.Delete(options.UnixSocketPath!!)
                    }
                } catch (IOException) {
                    // Best-effort: a stuck socket will surface as a Kestrel bind error below.

                }
                builder.WebHost.ConfigureKestrel(
                    (kestrel KestrelServerOptions) -> {
                        kestrel.ListenUnixSocket(options.UnixSocketPath!!)
                    }
                )
            }
            RegisterShared(builder.Services, options, factories, ServerTransport.Http)
            let app = builder.Build()
            if useUnix {
                app.Urls.Clear()
                // Surface the socket path in the same place TCP urls go so logs read sensibly.
                app.Urls.Add("http://unix:${options.UnixSocketPath}")
            } else {
                app.Urls.Clear()
                app.Urls.Add(
                    "http://${(if bindAddr!!.AddressFamily == AddressFamily.InterNetworkV6 { "[::1]" } else { bindAddr!!.ToString() })}:${options.HttpPort}"
                )
            }
            HttpEndpoints.Map(app)
            return app
        }

        /// Build a configured stdio MCP host. Public so tests can introspect tool registration
        /// without spinning up I/O.
        func BuildStdioHost(options ServerOptions, factories ServiceFactories) IHost {
            let builder = Host.CreateApplicationBuilder()
            builder.Logging.ClearProviders()
            builder.Logging.AddProvider(StderrLoggerProvider())
            RegisterShared(builder.Services, options, factories, ServerTransport.Stdio)
            builder.Services.AddMcpServer().WithStdioServerTransport().WithTools[McpTools]()
            return builder.Build()
        }

        /// Run the configured server. Returns when the process is asked to stop.
        async func RunAsync(
            options ServerOptions,
            factories ServiceFactories,
            cancellationToken CancellationToken = default(CancellationToken)
        ) int32 {
            if !options.EnableStdio && !options.EnableHttp {
                await Console
                    .Error
                    .WriteLineAsync("oahu-cli serve: must enable at least one of --mcp or --http.")
                    .ConfigureAwait(false)
                return ExitCodes.UsageError
            }
            // Acquire the cooperative file lock first — fail fast on contention.
            using let dataLock = UserDataLock(options.LockPath)
            try {
                dataLock.Acquire()
            } catch (ex InvalidOperationException) {
                await Console.Error.WriteLineAsync(ex.Message).ConfigureAwait(false)
                // Exit 6 = single-instance lock contention (per design §10).
                // Exit 4 is reserved for Audible API errors.
                return ExitCodes.Locked
            }
            // Ensure the token file exists if HTTP is enabled (so we fail fast on permission issues too).
            if options.EnableHttp {
                try {
                    let _ = TokenStore(options.TokenPath).ReadOrCreate()
                } catch (ex Exception) {
                    await Console
                        .Error
                        .WriteLineAsync("oahu-cli serve: token init failed: ${ex.Message}")
                        .ConfigureAwait(false)
                    // Token init failure is a setup/environment issue; reuse the
                    // generic-failure exit code (the design table reserves 5 for
                    // decryption errors specifically).
                    return ExitCodes.GenericFailure
                }
            }
            var stdioTask Task? = nil
            var httpApp WebApplication? = nil
            try {
                if options.EnableStdio {
                    let stdioHost = BuildStdioHost(options, factories)
                    stdioTask = stdioHost.RunAsync(cancellationToken)
                }
                if options.EnableHttp {
                    httpApp = BuildHttpApp(options, factories)
                    await httpApp.StartAsync(cancellationToken).ConfigureAwait(false)
                    // Lock down a freshly-bound Unix socket so only the owning UID
                    // can connect. Kestrel's default umask is process-inherited, so
                    // we re-apply 0600 explicitly. No-op on Windows (won't get here
                    // anyway: BuildHttpApp throws PNS for unix on Windows).
                    if !string.IsNullOrEmpty(options.UnixSocketPath) && !OperatingSystem.IsWindows() {
                        try {
                            File.SetUnixFileMode(
                                options.UnixSocketPath!!,
                                UnixFileMode.UserRead | UnixFileMode.UserWrite
                            )
                        } catch (ex Exception) {
                            await Console
                                .Error
                                .WriteLineAsync(
                                "oahu-cli serve: warning: could not chmod 0600 on '${options.UnixSocketPath}': ${ex.Message}"
                            )
                                .ConfigureAwait(false)
                        }
                    }
                    let addresses = string.Join(", ", httpApp.Urls)
                    await Console
                        .Error
                        .WriteLineAsync("oahu-cli serve: HTTP listening on $addresses")
                        .ConfigureAwait(false)
                }
                if stdioTask != nil {
                    await stdioTask.ConfigureAwait(false)
                } else if httpApp != nil {
                    await httpApp.WaitForShutdownAsync(cancellationToken).ConfigureAwait(false)
                }
                return ExitCodes.Success
            } catch (OperationCanceledException) {
                return ExitCodes.Success
            } finally {
                if httpApp != nil {
                    await httpApp.DisposeAsync().ConfigureAwait(false)
                }
                // Remove the Unix-socket file when the server exits cleanly.
                // Best-effort: a missing file is fine, and we don't want to mask a
                // real error from the inner block.
                if !string.IsNullOrEmpty(options.UnixSocketPath) {
                    try {
                        File.Delete(options.UnixSocketPath!!)
                    } catch (IOException) { } catch (UnauthorizedAccessException) { }
                }
            }
        }

        /// Shared DI registration for both stdio MCP and HTTP REST.
        func RegisterShared(
            services IServiceCollection,
            options ServerOptions,
            factories ServiceFactories,
            transport ServerTransport
        ) {
            services.AddSingleton((_ IServiceProvider) -> factories.Auth())
            services.AddSingleton((_ IServiceProvider) -> factories.Library())
            services.AddSingleton((_ IServiceProvider) -> factories.Queue())
            services.AddSingleton((_ IServiceProvider) -> factories.Job())
            services.AddSingleton((_ IServiceProvider) -> factories.Config())
            services.AddSingleton((_ IServiceProvider) -> factories.Doctor())
            services.AddSingleton(options)
            services.AddSingleton[OahuTools]()
            services.AddSingleton(TokenStore(options.TokenPath))
            services.AddSingleton(AuditLog(options.AuditPath))
            services.AddSingleton(CapabilityPolicy(transport, options.Unattended))
            services.AddSingleton[TokenBucketRateLimiter]()
            services.AddSingleton[ToolDispatcher]()
        }
    }
}
