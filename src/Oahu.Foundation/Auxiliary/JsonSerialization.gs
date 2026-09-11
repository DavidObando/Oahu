package Oahu.Aux

import System.IO
import System.Text.Encodings.Web
import System.Text.Json
import System.Text.Json.Serialization
import System.Text.Json.Serialization.Metadata
import System.Threading.Tasks

class JsonSerialization {
    shared {
        let SerializerOptions JsonSerializerOptions = JsonSerializerOptions{
            TypeInfoResolver: DefaultJsonTypeInfoResolver(),
            WriteIndented: true,
            ReadCommentHandling: JsonCommentHandling.Skip,
            AllowTrailingCommas: true,
            Converters: {JsonStringEnumConverter()},
            Encoder: JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        }
    }
}

func (obj T) ToJsonFile[T](path string) {
    using let fs = FileStream(path, FileMode.Create)
    let task = Task.Run(
        async () -> {
            await JsonSerializer.SerializeAsync(fs, obj, JsonSerialization.SerializerOptions)
        }
    )
    task.Wait()
}

func (path string) FromJsonFile[T]() T {
    using let fs = FileStream(path, FileMode.Open, FileAccess.Read)
    let task = Task.Run(async () -> await JsonSerializer.DeserializeAsync[T](fs, JsonSerialization.SerializerOptions))
    return task.Result
}
