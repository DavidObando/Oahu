package Oahu.Cli.Server.Capabilities

import System

/// Run-time gate: given a transport (stdio MCP vs. HTTP) and tool capability,
/// either allow the call or throw a uniform (cref:UnauthorizedAccessException)
/// the tool host translates to a structured MCP/HTTP error.
///
/// v1 policy (per design §15.2 — simplified, scopes deferred):
/// - <b>Safe</b>: always allowed.
/// - <b>Mutating</b>/<b>Expensive</b>: allowed under HTTP (already gated by bearer token); under stdio
/// MCP requires `--unattended` OR an interactive prompt confirmation. v1 ships <i>no</i> stdio prompt —
/// auto-deny when `--unattended` is not set.
/// - <b>Destructive</b>: always requires the caller to pass `confirm: true`; otherwise auto-deny. Once
/// confirmed, falls through to the Mutating rule.
class CapabilityPolicy {
    init(transport ServerTransport, unattended bool) {
        Transport = transport
        Unattended = unattended
    }

    prop Transport ServerTransport {
        get;
        init;
    }

    prop Unattended bool {
        get;
        init;
    }

    func Require(toolName string, capability CapabilityClass, confirmed bool = false) {
        if capability == CapabilityClass.Safe {
            return
        }
        if capability == CapabilityClass.Destructive && !confirmed {
            throw UnauthorizedAccessException(
                "$toolName is destructive; pass `confirm: true` in the tool arguments to authorise."
            )
        }
        if Transport == ServerTransport.Http {
            // HTTP requests are already authenticated by the bearer-token middleware.
            return
        }
        // Stdio MCP path: require --unattended for everything non-safe.
        if !Unattended {
            throw UnauthorizedAccessException(
                "$toolName requires unattended mode; restart the server with --unattended " +
                    "(or call this tool over the loopback HTTP transport with a valid token)."
            )
        }
    }
}

/// Which surface a tool invocation arrived through.
enum ServerTransport {
    Stdio,
    Http
}
