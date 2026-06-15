// G# port of Server/AuditLogTests.cs — full port on 0.1.459.

package Oahu.Cli.Tests.Server

import System
import System.Collections.Generic
import System.IO
import System.Linq
import Oahu.Cli.Server.Audit
import Xunit

class AuditLogTests {

    @Fact
    func HashArgs_Is_Deterministic_And_Order_Independent() {
        var a = Dictionary[string, object?]()
        a["asin"] = "B0123"
        a["limit"] = 10
        var b = Dictionary[string, object?]()
        b["limit"] = 10
        b["asin"] = "B0123"
        Assert.Equal(AuditLog.HashArgs(a), AuditLog.HashArgs(b))
        var c = Dictionary[string, object?]()
        c["asin"] = "B9999"
        c["limit"] = 10
        Assert.NotEqual(AuditLog.HashArgs(a), AuditLog.HashArgs(c))
    }

    @Fact
    func HashArgs_Empty_Args_Is_Sha256_Of_Empty() {
        var h = AuditLog.HashArgs(nil)
        Assert.StartsWith("sha256:", h)
        Assert.Equal("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", h)
    }

    @Fact
    func Write_Appends_One_Json_Line() {
        var path = Path.Combine(Path.GetTempPath(), "oahu-audit-" + Guid.NewGuid().ToString("N") + ".jsonl")
        try {
            var log = AuditLog(path)
            var args1 = Dictionary[string, object?]()
            args1["filter"] = "asimov"
            log.Write("http", "http", "library_list", args1, "ok", 12)
            var args2 = Dictionary[string, object?]()
            args2["asins"] = []string{"B1"}
            log.Write("stdio", "stdio", "queue_add", args2, "denied", 1)
            var lines = File.ReadAllLines(path).ToList()
            Assert.Equal(2, lines.Count)
            var line0 = lines[0]
            var line1 = lines[1]
            Assert.Contains("\"tool\":\"library_list\"", line0)
            Assert.Contains("\"outcome\":\"ok\"", line0)
            Assert.Contains("\"argsHash\":\"sha256:", line0)
            Assert.DoesNotContain("asimov", line0)
            Assert.Contains("\"outcome\":\"denied\"", line1)
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }
}
