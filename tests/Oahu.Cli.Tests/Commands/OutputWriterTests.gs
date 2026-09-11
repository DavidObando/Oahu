package Oahu.Cli.Tests.Commands

import Oahu.Cli.Output
import Spectre.Console.Testing
import System.Collections.Generic
import System.IO
import System.Text.Json.Nodes
import Xunit

class OutputWriterTests {
    @Fact
    func ResolveFormat_RespectsJsonAndPlain() {
        Assert.Equal(
            OutputFormat.Json,
            OutputContext.ResolveFormat(jsonFlag: true, plainFlag: false, stdoutIsRedirected: false)
        )
        Assert.Equal(OutputFormat.Plain, OutputContext.ResolveFormat(false, true, false))
        Assert.Equal(OutputFormat.Pretty, OutputContext.ResolveFormat(false, false, false))
        Assert.Equal(OutputFormat.Plain, OutputContext.ResolveFormat(false, false, stdoutIsRedirected: true))
        Assert.Equal(OutputFormat.Json, OutputContext.ResolveFormat(true, true, false))
    }

    @Fact
    func Json_WriteResource_IncludesSchemaVersionAndResource() {
        let sw = StringWriter()
        let w = JsonOutputWriter(OutputContext(OutputFormat.Json, false, false, false), sw)
        w.WriteResource("config-value", Dictionary[string, object?]{["key"] = "max-parallel-jobs", ["value"] = 5})
        let node = JsonNode.Parse(sw.ToString())!!
        Assert.Equal("1", string?(node["_schemaVersion"]))
        Assert.Equal("config-value", string?(node["resource"]))
        Assert.Equal("max-parallel-jobs", string?(node["key"]))
        Assert.Equal(5, int32?(node["value"]))
    }

    @Fact
    func Json_WriteCollection_IncludesCountAndItems() {
        let sw = StringWriter()
        let w = JsonOutputWriter(OutputContext(OutputFormat.Json, false, false, false), sw)
        let rows = List[IReadOnlyDictionary[string, object?]]{
            Dictionary[string, object?]{["asin"] = "A1", ["title"] = "T1"},
            Dictionary[string, object?]{["asin"] = "A2", ["title"] = "T2"}
        }
        w.WriteCollection("queue", rows, []OutputColumn{OutputColumn("asin"), OutputColumn("title")})
        let node = JsonNode.Parse(sw.ToString())!!
        Assert.Equal("queue", string?(node["resource"]))
        Assert.Equal(2, int32?(node["count"]))
        Assert.Equal(2, (cast[JsonArray](node["items"]!!)).Count)
        Assert.Equal("A2", string?(node["items"]!![1]!!["asin"]))
    }

    @Fact
    func Plain_WritesTabSeparatedRowsWithHeader() {
        let sw = StringWriter()
        let w = PlainOutputWriter(OutputContext(OutputFormat.Plain, false, false, false), sw)
        let rows = List[IReadOnlyDictionary[string, object?]]{Dictionary[string, object?]{["a"] = "x", ["b"] = "y"}}
        w.WriteCollection("t", rows, []OutputColumn{OutputColumn("a", "A"), OutputColumn("b", "B")})
        let lines = sw.ToString().TrimEnd('\r', '\n').Split('\n')
        Assert.Equal("A\tB", lines[0].TrimEnd('\r'))
        Assert.Equal("x\ty", lines[1].TrimEnd('\r'))
    }

    @Fact
    func Pretty_WritesTableWithoutThrowing() {
        let console = TestConsoleExtensions.EmitAnsiSequences(TestConsole())
        let w = PrettyOutputWriter(OutputContext(OutputFormat.Pretty, false, true, false), console)
        let rows = List[IReadOnlyDictionary[string, object?]]{
            Dictionary[string, object?]{["asin"] = "A1", ["title"] = "T1"}
        }
        w.WriteCollection("queue", rows, []OutputColumn{OutputColumn("asin", "ASIN"), OutputColumn("title", "Title")})
        Assert.Contains("ASIN", console.Output)
        Assert.Contains("A1", console.Output)
    }

    @Fact
    func Quiet_SuppressesMessages() {
        let sw = StringWriter()
        let w = PlainOutputWriter(OutputContext(OutputFormat.Plain, quiet: true, false, false), sw)
        w.WriteSuccess("done")
        Assert.Empty(sw.ToString())
    }
}
