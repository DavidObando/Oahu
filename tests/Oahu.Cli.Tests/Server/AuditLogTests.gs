package Oahu.Cli.Tests.Server

import Oahu.Cli.Server.Audit
import System
import System.Collections.Generic
import System.IO
import Xunit

class AuditLogTests {
    @Fact
    func HashArgs_Is_Deterministic_And_Order_Independent() {
        let a = Dictionary[string, object?]{["asin"] = "B0123", ["limit"] = 10}
        let b = Dictionary[string, object?]{["limit"] = 10, ["asin"] = "B0123"}
        Assert.Equal(AuditLog.HashArgs(a), AuditLog.HashArgs(b))
        let c = Dictionary[string, object?]{["asin"] = "B9999", ["limit"] = 10}
        Assert.NotEqual(AuditLog.HashArgs(a), AuditLog.HashArgs(c))
    }

    @Fact
    func HashArgs_Empty_Args_Is_Sha256_Of_Empty() {
        let h = AuditLog.HashArgs(nil)
        Assert.StartsWith("sha256:", h)
        Assert.Equal("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", h)
    }

    @Fact
    func Write_Appends_One_Json_Line() {
        let path = Path.Combine(Path.GetTempPath(), "oahu-audit-${Guid.NewGuid():n}.jsonl")
        try {
            let log = AuditLog(path)
            log.Write("http", "http", "library_list", Dictionary[string, object?]{["filter"] = "asimov"}, "ok", 12)
            log.Write(
                "stdio",
                "stdio",
                "queue_add",
                Dictionary[string, object?]{["asins"] = []string{"B1"}},
                "denied",
                1
            )
            let lines = File.ReadAllLines(path)
            Assert.Equal(2, lines.Length)
            Assert.Contains("\"tool\":\"library_list\"", lines[0])
            Assert.Contains("\"outcome\":\"ok\"", lines[0])
            Assert.Contains("\"argsHash\":\"sha256:", lines[0])
            Assert.DoesNotContain("asimov", lines[0]) // args must be hashed, not logged in clear.
            Assert.Contains("\"outcome\":\"denied\"", lines[1])
        } finally {
            if File.Exists(path) {
                File.Delete(path)
            }
        }
    }
}
