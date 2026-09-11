package Oahu.Cli.Server.Hosting

import System
import System.Net

/// Resolved configuration for a single `oahu-cli serve` invocation.
class ServerOptions {
    init() {
        HttpHost = "127.0.0.1"
    }

    /// Enable the JSON-RPC stdio MCP transport.
    prop EnableStdio bool {
        get;
        init;
    }

    /// Enable the loopback HTTP REST + SSE transport.
    prop EnableHttp bool {
        get;
        init;
    }

    /// Bind address for HTTP. Must be loopback (127.0.0.1 / ::1). Default: `127.0.0.1`.
    prop HttpHost string {
        get;
        init;
    }

    /// HTTP port. `0` = ephemeral.
    prop HttpPort int32 {
        get;
        init;
    }

    /// Allow Mutating/Expensive tools without an interactive prompt under stdio.
    prop Unattended bool {
        get;
        init;
    }

    /// Optional override for the bearer-token file path (defaults to `<ConfigDir>/server.token`).
    prop TokenPath string? {
        get;
        init;
    }

    /// Optional override for the lock file path (test hook).
    prop LockPath string? {
        get;
        init;
    }

    /// Optional override for the audit log path (test hook).
    prop AuditPath string? {
        get;
        init;
    }

    /// When set, the HTTP transport binds to a Unix-domain socket at this path
    /// instead of (cref:HttpHost) / (cref:HttpPort). Mutually
    /// exclusive with the TCP options. Not supported on Windows.
    prop UnixSocketPath string? {
        get;
        init;
    }

    /// When true and (cref:UnixSocketPath) is set, the server verifies that
    /// each incoming HTTP connection's peer UID matches the server's UID and
    /// rejects mismatched connections with HTTP 403. Linux + macOS only.
    prop StrictPeer bool {
        get;
        init;
    }

    /// Validates loopback constraint and returns the parsed (cref:IPAddress).
    func ResolveBindAddress() IPAddress {
        if (HttpHost is "localhost" or "127.0.0.1") {
            return IPAddress.Loopback
        }
        if HttpHost == "::1" {
            return IPAddress.IPv6Loopback
        }
        if IPAddress.TryParse(HttpHost, out var ip) && IPAddress.IsLoopback(ip) {
            return ip
        }
        throw InvalidOperationException(
            "oahu-cli serve refuses to bind to non-loopback address '$HttpHost'. " +
                "Only 127.0.0.1, ::1, and localhost are accepted in v1."
        )
    }
}
