// G# port of src/Oahu.Cli.App/AtomicFile.cs.
// G# has no static class and (in 0.1.516) does not preserve user-defined
// generic type-parameters — `func WriteAllJson[T]` lowers to a non-generic
// method taking object/Type. We expose explicit Type args instead and name
// the type `ExpAtomicFile` to avoid colliding with C# Oahu.Cli.App.AtomicFile.

package Oahu.Cli.App.Experiment

import System
import System.IO
import System.Text.Json

type ExpAtomicFile class {
    DefaultJsonOptions JsonSerializerOptions = JsonSerializerOptions() {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
    }

    func WriteAllJson(path string, value object, options JsonSerializerOptions?) {
        let dir = Path.GetDirectoryName(path)
        if !String.IsNullOrEmpty(dir) {
            Directory.CreateDirectory(dir!!)
        }
        let tmp = path + "." + Guid.NewGuid().ToString("N") + ".tmp"
        try {
            using let stream = FileStream(tmp, FileMode.CreateNew, FileAccess.Write, FileShare.None)
            JsonSerializer.Serialize(stream, value, value.GetType(), options ?: DefaultJsonOptions)
            stream.Flush(true)
            File.Move(tmp, path, true)
        } catch (e Exception) {
            try {
                if File.Exists(tmp) {
                    File.Delete(tmp)
                }
            } catch (ignore Exception) {
                // best-effort cleanup
            }
            throw e
        }
    }

    func ReadJson(path string, returnType Type, options JsonSerializerOptions?) object? {
        if !File.Exists(path) {
            return nil
        }
        using let stream = File.OpenRead(path)
        return JsonSerializer.Deserialize(stream, returnType, options ?: DefaultJsonOptions)
    }
}

