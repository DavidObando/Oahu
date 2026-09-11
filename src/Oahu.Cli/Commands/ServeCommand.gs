package Oahu.Cli.Commands

import Oahu.Cli.App.Config
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Errors
import Oahu.Cli.App.Paths
import Oahu.Cli.Server.Auth
import Oahu.Cli.Server.Hosting
import System
import System.CommandLine
import System.CommandLine.Parsing
import System.Threading
import System.Threading.Tasks

/// `oahu-cli serve` — runs the MCP-stdio + loopback HTTP server (Phase 5).
///
/// Subcommands:
///
/// - `serve` (default): start the server with the configured transports.
/// - `serve token` <`show`|`rotate`|`path`>: manage the bearer token.
///
/// Token rotation is offline-only: refuse if a server is currently holding the
/// data-dir lock. Documented in `docs/OAHU_CLI_SERVER.md`.
class ServeCommand {
    shared {
        /// Legacy alias for (cref:ExitCodes.Locked); kept for source compatibility with tests.
        const LockedExitCode int32 = ExitCodes.Locked

        func Create(resolveGlobals(ParseResult) -> GlobalOptions) Command {
            let cmd = Command("serve", "Run the MCP / loopback HTTP server (Phase 5).")
            let mcpOpt = Option[bool]("--mcp"){
                Description = "Enable the JSON-RPC stdio MCP transport (default if neither --mcp nor --http is set)."
            }
            let httpOpt = Option[bool]("--http"){Description = "Enable the loopback HTTP REST + SSE transport."}
            let bindOpt = Option[string?]("--bind"){
                Description = "HTTP bind address. Must be loopback (127.0.0.1, ::1, localhost). Default: 127.0.0.1."
            }
            let portOpt = Option[int32?]("--port"){Description = "HTTP TCP port. Default: 8765. Use 0 for ephemeral."}
            let listenOpt = Option[string?]("--listen"){
                Description = "Alternative HTTP transport: 'unix:<path>' to bind to a Unix-domain socket (Linux/macOS only; chmod 0600). Mutually exclusive with --bind/--port."
            }
            let strictPeerOpt = Option[bool]("--strict-peer"){
                Description = "When set with --listen unix:..., reject HTTP connections whose peer UID does not match the server's UID. No-op for TCP / Windows."
            }
            let unattendedOpt = Option[bool]("--unattended"){
                Description = "Allow Mutating/Expensive tools without interactive confirmation under stdio MCP."
            }
            cmd.Options.Add(mcpOpt)
            cmd.Options.Add(httpOpt)
            cmd.Options.Add(bindOpt)
            cmd.Options.Add(portOpt)
            cmd.Options.Add(listenOpt)
            cmd.Options.Add(strictPeerOpt)
            cmd.Options.Add(unattendedOpt)
            cmd.SetAction(
                async (parse ParseResult, ct CancellationToken) -> {
                    var enableStdio = parse.GetValue(mcpOpt)
                    var enableHttp = parse.GetValue(httpOpt)
                    let listenRaw = parse.GetValue(listenOpt)
                    var unixSocketPath string? = nil
                    if !string.IsNullOrEmpty(listenRaw) {
                        if !listenRaw.StartsWith("unix:", StringComparison.OrdinalIgnoreCase) {
                            Console.Error.WriteLine(
                                "oahu-cli: --listen '$listenRaw' is not valid. Only 'unix:<path>' is supported."
                            )
                            return ExitCodes.UsageError
                        }
                        unixSocketPath = listenRaw.Substring("unix:".Length)
                        if string.IsNullOrWhiteSpace(unixSocketPath) {
                            Console.Error.WriteLine("oahu-cli: --listen unix:<path> requires a non-empty path.")
                            return ExitCodes.UsageError
                        }
                        if parse.GetValue(bindOpt) != nil || parse.GetValue(portOpt) != nil {
                            Console.Error.WriteLine("oahu-cli: --listen is mutually exclusive with --bind/--port.")
                            return ExitCodes.UsageError
                        }
                        // Implicitly enable HTTP when --listen is given.
                        enableHttp = true
                    }
                    if !enableStdio && !enableHttp {
                        enableStdio = true
                    }
                    let options = ServerOptions{
                        EnableStdio: enableStdio,
                        EnableHttp: enableHttp,
                        HttpHost: parse.GetValue(bindOpt) ?? "127.0.0.1",
                        HttpPort: parse.GetValue(portOpt) ?? 8765,
                        UnixSocketPath: unixSocketPath,
                        StrictPeer: parse.GetValue(strictPeerOpt),
                        Unattended: parse.GetValue(unattendedOpt)
                    }
                    let factories = ServerHost
                        .ServiceFactories{
                        Auth: CliServiceFactory.AuthServiceFactory,
                        Library: CliServiceFactory.LibraryServiceFactory,
                        Queue: CliServiceFactory.QueueServiceFactory,
                        Job: CliServiceFactory.JobServiceFactory,
                        Config: () -> JsonConfigService(CliPaths.ConfigFile),
                        Doctor: () -> DoctorService()
                    }
                    return await ServerHost.RunAsync(options, factories, ct).ConfigureAwait(false)
                }
            )
            cmd.Subcommands.Add(CreateTokenCommand())
            return cmd
        }

        private func CreateTokenCommand() Command {
            let token = Command("token", "Manage the loopback HTTP bearer token.")
            let showCmd = Command("show", "Print the current bearer token to stdout.")
            showCmd.SetAction(
                (_ ParseResult) -> {
                    let ts = TokenStore()
                    Console.Out.WriteLine(ts.ReadOrCreate())
                    return ExitCodes.Success
                }
            )
            let pathCmd = Command("path", "Print the path to the bearer-token file.")
            pathCmd.SetAction(
                (_ ParseResult) -> {
                    Console.Out.WriteLine(TokenStore().Path)
                    return ExitCodes.Success
                }
            )
            let rotateCmd = Command(
                "rotate",
                "Mint a new bearer token, replacing the existing one. Refuses while a server is running."
            )
            rotateCmd.SetAction(
                (_ ParseResult) -> {
                    using let dataLock = UserDataLock()
                    try {
                        dataLock.Acquire()
                    } catch (ex InvalidOperationException) {
                        Console.Error.WriteLine(ex.Message)
                        Console.Error.WriteLine("Stop the running server before rotating its token.")
                        return ExitCodes.Locked
                    }
                    let fresh = TokenStore().Rotate()
                    Console.Out.WriteLine(fresh)
                    return ExitCodes.Success
                }
            )
            token.Subcommands.Add(showCmd)
            token.Subcommands.Add(pathCmd)
            token.Subcommands.Add(rotateCmd)
            return token
        }
    }
}
