// G# port of Server/CapabilityPolicyTests.cs — full port on 0.1.459.

package Oahu.Cli.Tests.Server

import System
import Oahu.Cli.Server.Capabilities
import Xunit

class CapabilityPolicyTests {

    @Fact
    func Safe_Always_Allowed() {
        CapabilityPolicy(ServerTransport.Stdio, false).Require("library_list", CapabilityClass.Safe)
        CapabilityPolicy(ServerTransport.Http, false).Require("library_list", CapabilityClass.Safe)
    }

    @Fact
    func Mutating_Denied_Under_Stdio_Without_Unattended() {
        var p = CapabilityPolicy(ServerTransport.Stdio, false)
        Assert.Throws[UnauthorizedAccessException](func() { p.Require("queue_add", CapabilityClass.Mutating) })
    }

    @Fact
    func Mutating_Allowed_Under_Stdio_With_Unattended() {
        CapabilityPolicy(ServerTransport.Stdio, true).Require("queue_add", CapabilityClass.Mutating)
    }

    @Fact
    func Mutating_Allowed_Under_Http_Always() {
        CapabilityPolicy(ServerTransport.Http, false).Require("queue_add", CapabilityClass.Mutating)
    }

    @Fact
    func Destructive_Requires_Confirm_Even_In_Unattended() {
        var p = CapabilityPolicy(ServerTransport.Http, true)
        Assert.Throws[UnauthorizedAccessException](func() { p.Require("queue_clear", CapabilityClass.Destructive, false) })
        p.Require("queue_clear", CapabilityClass.Destructive, true)
    }

    @Fact
    func Expensive_Treated_Like_Mutating() {
        Assert.Throws[UnauthorizedAccessException](func() {
            CapabilityPolicy(ServerTransport.Stdio, false).Require("library_sync", CapabilityClass.Expensive)
        })
        CapabilityPolicy(ServerTransport.Http, false).Require("library_sync", CapabilityClass.Expensive)
    }
}
