package Oahu.Cli.Output

import System
import System.Collections
import System.Collections.Generic
import System.IO
import System.Text.Encodings.Web
import System.Text.Json
import System.Text.Json.Nodes

/// Emits documents conforming to `docs/cli-schemas/*.schema.json`.
/// Every document includes a top-level `_schemaVersion` string per design §9.
class JsonOutputWriter : IOutputWriter {
    private let writer TextWriter

    init(context OutputContext, writer TextWriter) {
        Context = context
        this.writer = writer
    }

    prop Context OutputContext {
        get;
        init;
    }

    func WriteResource(resourceName string, data IReadOnlyDictionary[string, object?]) {
        let obj = JsonObject(){["_schemaVersion"] = SchemaVersion, ["resource"] = resourceName}
        for kv in data {
            obj[kv.Key] = ToNode(kv.Value)
        }
        SafeWrite(() -> writer.WriteLine(obj.ToJsonString(WriteOptions)))
    }

    func WriteCollection(
        resourceName string,
        rows IReadOnlyList[IReadOnlyDictionary[string, object?]],
        columns IReadOnlyList[OutputColumn]
    ) {
        let array = JsonArray()
        for row in rows {
            let item = JsonObject()
            for kv in row {
                item[kv.Key] = ToNode(kv.Value)
            }
            array.Add(item)
        }
        let obj = JsonObject(){
            ["_schemaVersion"] = SchemaVersion,
            ["resource"] = resourceName,
            ["count"] = rows.Count,
            ["items"] = array
        }
        SafeWrite(() -> writer.WriteLine(obj.ToJsonString(WriteOptions)))
    }

    func WriteMessage(message string) {
        // JSON mode keeps stdout free of free-form prose; messages go to stderr only when needed.
        // Quiet always suppresses; we deliberately never inject prose into the JSON document.
        if Context.Quiet {
            return
        }
        SafeWrite(() -> Console.Error.WriteLine(message))
    }

    func WriteSuccess(message string) -> WriteMessage(message)

    shared {
        const SchemaVersion string = "1"
        private let WriteOptions JsonSerializerOptions = JsonSerializerOptions{
            WriteIndented: true,
            PropertyNamingPolicy: nil,
            Encoder: JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        }

        private func SafeWrite(action() -> void) {
            try {
                action()
            } catch (IOException) {
                // Broken pipe — downstream consumer closed the stream.

            } catch (ObjectDisposedException) {
                // Output stream torn down.

            }
        }

        private func ToNode(value object?) JsonNode? -> switch value {
            case nil: default(JsonNode?)
            case s is string: cast[JsonNode](JsonValue.Create(s))
            case b is bool: cast[JsonNode](JsonValue.Create(b))
            case i is int32: cast[JsonNode](JsonValue.Create(i))
            case l is int64: cast[JsonNode](JsonValue.Create(l))
            case d is float64: cast[JsonNode](JsonValue.Create(d))
            case dto is DateTimeOffset: cast[JsonNode](JsonValue.Create(dto.ToString("O")))
            case dt is DateTime: cast[JsonNode](JsonValue.Create(dt.ToString("O")))
            case e is Enum: cast[JsonNode](JsonValue.Create(e.ToString()))
            case n is JsonNode: n
            case dict is IReadOnlyDictionary[string, object?]: cast[JsonNode](DictToNode(dict))
            case seq is IEnumerable: cast[JsonNode](SeqToNode(seq))
            default: (JsonValue.Create(value!!.ToString()) as JsonNode?)
        }

        private func DictToNode(dict IReadOnlyDictionary[string, object?]) JsonObject {
            let obj = JsonObject()
            for kv in dict {
                obj[kv.Key] = ToNode(kv.Value)
            }
            return obj
        }

        private func SeqToNode(seq IEnumerable) JsonArray {
            let arr = JsonArray()
            for item in seq {
                arr.Add(ToNode(item))
            }
            return arr
        }
    }
}
