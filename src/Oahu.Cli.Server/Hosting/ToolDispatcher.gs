package Oahu.Cli.Server.Hosting

import Oahu.Cli.Server.Audit
import Oahu.Cli.Server.Capabilities
import System
import System.Collections.Generic
import System.Diagnostics
import System.Threading.Tasks

/// Wraps tool invocations with the capability gate + audit logging. Used by both
/// the MCP tool host and the REST endpoints so the policy is enforced exactly once
/// regardless of transport.
class ToolDispatcher {
    private let policy CapabilityPolicy
    private let audit AuditLog

    init(policy CapabilityPolicy, audit AuditLog) {
        this.policy = policy
        this.audit = audit
    }

    prop Policy CapabilityPolicy -> policy

    async func InvokeAsync[T](
        toolName string,
        capability CapabilityClass,
        args IReadOnlyDictionary[string, object?]?,
        body async () -> T,
        confirmed bool = false,
        principal string = "stdio"
    ) T {
        let transport = if policy.Transport == ServerTransport.Http {
            "http"
        } else {
            "stdio"
        }
        let sw = Stopwatch.StartNew()
        try {
            policy.Require(toolName, capability, confirmed)
        } catch (UnauthorizedAccessException) {
            SafeAudit(transport, principal, toolName, args, "denied", sw.ElapsedMilliseconds)
            rethrow
        }
        try {
            let result = await body().ConfigureAwait(false)
            SafeAudit(transport, principal, toolName, args, "ok", sw.ElapsedMilliseconds)
            return result
        } catch (Exception) {
            SafeAudit(transport, principal, toolName, args, "error", sw.ElapsedMilliseconds)
            rethrow
        }
    }

    private func SafeAudit(
        transport string,
        principal string,
        toolName string,
        args IReadOnlyDictionary[string, object?]?,
        outcome string,
        latencyMs int64
    ) {
        try {
            audit.Write(transport, principal, toolName, args, outcome, latencyMs)
        } catch {
            // The original tool result/exception must surface — never let an audit
            // failure mask the actual outcome the caller cares about.

        }
    }
}
