package Oahu.Cli.Server.Capabilities

import System

/// Per-tool capability class — drives whether a tool can run unattended,
/// whether HTTP must require an unrestricted bearer token, and whether
/// destructive confirmations are required.
///
/// See `docs/OAHU_CLI_DESIGN.md` §15.2.
enum CapabilityClass {
    Safe,
    Mutating,
    Expensive,
    Destructive
}

/// Marker attribute on tool methods so capability is owned by code, not by description text.
@System.AttributeUsage(AttributeTargets.Method, AllowMultiple: false)
class OahuCapabilityAttribute : Attribute {
    init(capability CapabilityClass) {
        Capability = capability
    }

    prop Capability CapabilityClass {
        get;
        init;
    }
}
