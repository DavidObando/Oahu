package Oahu.Cli.Tests.Server

import Oahu.Cli.Server.Capabilities
import System
import Xunit

class CapabilityPolicyTests {
    @Fact
    func Safe_Always_Allowed() {
        CapabilityPolicy(ServerTransport.Stdio, unattended: false).Require("library_list", CapabilityClass.Safe)
        CapabilityPolicy(ServerTransport.Http, unattended: false).Require("library_list", CapabilityClass.Safe)
    }

    @Fact
    func Mutating_Denied_Under_Stdio_Without_Unattended() {
        let p = CapabilityPolicy(ServerTransport.Stdio, unattended: false)
        Assert.Throws[UnauthorizedAccessException](() -> p.Require("queue_add", CapabilityClass.Mutating))
    }

    @Fact
    func Mutating_Allowed_Under_Stdio_With_Unattended() {
        CapabilityPolicy(ServerTransport.Stdio, unattended: true).Require("queue_add", CapabilityClass.Mutating)
    }

    @Fact
    func Mutating_Allowed_Under_Http_Always() {
        CapabilityPolicy(ServerTransport.Http, unattended: false).Require("queue_add", CapabilityClass.Mutating)
    }

    @Fact
    func Destructive_Requires_Confirm_Even_In_Unattended() {
        let p = CapabilityPolicy(ServerTransport.Http, unattended: true)
        Assert.Throws[UnauthorizedAccessException](
            () -> p.Require("queue_clear", CapabilityClass.Destructive, confirmed: false)
        )
        p.Require("queue_clear", CapabilityClass.Destructive, confirmed: true) // ok

    }

    @Fact
    func Expensive_Treated_Like_Mutating() {
        Assert.Throws[UnauthorizedAccessException](
            () -> CapabilityPolicy(ServerTransport.Stdio, unattended: false).Require(
                "library_sync",
                CapabilityClass.Expensive
            )
        )
        CapabilityPolicy(ServerTransport.Http, unattended: false).Require("library_sync", CapabilityClass.Expensive)
    }
}
