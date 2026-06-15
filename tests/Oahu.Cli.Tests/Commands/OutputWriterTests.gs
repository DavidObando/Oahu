// G# port of Commands/OutputWriterTests.cs.
// All 6 tests recovered: StringWriter→TextWriter upcast works in 0.1.516,
// and Spectre.Console.Testing.TestConsole is available.

package Oahu.Cli.Tests.Commands

import System.Collections.Generic
import System.IO
import System.Text.Json.Nodes
import Oahu.Cli.Output
import Spectre.Console.Testing
import Xunit

class OutputWriterTests {
    @Fact
    func ResolveFormat_RespectsJsonAndPlain() {
        Assert.Equal(OutputFormat.Json, OutputContext.ResolveFormat(true, false, false))
        Assert.Equal(OutputFormat.Plain, OutputContext.ResolveFormat(false, true, false))
        Assert.Equal(OutputFormat.Pretty, OutputContext.ResolveFormat(false, false, false))
        Assert.Equal(OutputFormat.Plain, OutputContext.ResolveFormat(false, false, true))
        Assert.Equal(OutputFormat.Json, OutputContext.ResolveFormat(true, true, false))
    }

    @Fact
    func Json_WriteResource_IncludesSchemaVersionAndResource() {
        let sw = StringWriter()
        let ctx = OutputContext(OutputFormat.Json, false, false, false)
        let w = JsonOutputWriter(ctx, sw)
        let data = Dictionary[string, object?]()
        data["key"] = "max-parallel-jobs"
        data["value"] = 5
        w.WriteResource("config-value", data)

        let node = JsonNode.Parse(sw.ToString())!!
        Assert.Equal("1", string(node["_schemaVersion"]))
        Assert.Equal("config-value", string(node["resource"]))
        Assert.Equal("max-parallel-jobs", string(node["key"]))
        Assert.Equal(5, int32(node["value"]))
    }

    @Fact
    func Json_WriteCollection_IncludesCountAndItems() {
        let sw = StringWriter()
        let ctx = OutputContext(OutputFormat.Json, false, false, false)
        let w = JsonOutputWriter(ctx, sw)

        let r1 = Dictionary[string, object?]()
        r1["asin"] = "A1"
        r1["title"] = "T1"
        let r2 = Dictionary[string, object?]()
        r2["asin"] = "A2"
        r2["title"] = "T2"
        let rows = List[IReadOnlyDictionary[string, object?]]()
        rows.Add(r1)
        rows.Add(r2)

        let cols = List[OutputColumn]()
        cols.Add(OutputColumn("asin"))
        cols.Add(OutputColumn("title"))
        w.WriteCollection("queue", rows, cols)

        let node = JsonNode.Parse(sw.ToString())!!
        Assert.Equal("queue", string(node["resource"]))
        Assert.Equal(2, int32(node["count"]))
        let items = node["items"]!! as JsonArray
        Assert.Equal(2, items!!.Count)
        Assert.Equal("A2", string(items!![1]!!["asin"]))
    }

    @Fact
    func Plain_WritesTabSeparatedRowsWithHeader() {
        let sw = StringWriter()
        let ctx = OutputContext(OutputFormat.Plain, false, false, false)
        let w = PlainOutputWriter(ctx, sw)

        let r = Dictionary[string, object?]()
        r["a"] = "x"
        r["b"] = "y"
        let rows = List[IReadOnlyDictionary[string, object?]]()
        rows.Add(r)

        let cols = List[OutputColumn]()
        cols.Add(OutputColumn("a", "A"))
        cols.Add(OutputColumn("b", "B"))
        w.WriteCollection("t", rows, cols)

        let text = sw.ToString().TrimEnd('\r', '\n')
        let lines = text.Split('\n')
        Assert.Equal("A\tB", lines[0].TrimEnd('\r'))
        Assert.Equal("x\ty", lines[1].TrimEnd('\r'))
    }

    @Fact
    func Pretty_WritesTableWithoutThrowing() {
        let console = TestConsole().EmitAnsiSequences()
        let ctx = OutputContext(OutputFormat.Pretty, false, true, false)
        let w = PrettyOutputWriter(ctx, console)

        let r = Dictionary[string, object?]()
        r["asin"] = "A1"
        r["title"] = "T1"
        let rows = List[IReadOnlyDictionary[string, object?]]()
        rows.Add(r)

        let cols = List[OutputColumn]()
        cols.Add(OutputColumn("asin", "ASIN"))
        cols.Add(OutputColumn("title", "Title"))
        w.WriteCollection("queue", rows, cols)

        Assert.Contains("ASIN", console.Output)
        Assert.Contains("A1", console.Output)
    }

    @Fact
    func Quiet_SuppressesMessages() {
        let sw = StringWriter()
        let ctx = OutputContext(OutputFormat.Plain, true, false, false)
        let w = PlainOutputWriter(ctx, sw)
        w.WriteSuccess("done")
        Assert.Empty(sw.ToString())
    }
}
