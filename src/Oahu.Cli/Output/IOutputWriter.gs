package Oahu.Cli.Output

import System.Collections.Generic

/// Output abstraction shared by every command. Each handler chooses a default
/// shape and the writer implementation renders it for the active (cref:OutputFormat).
interface IOutputWriter {
    prop Context OutputContext {
        get;
    }

    /// Writes a single resource as an object.
    func WriteResource(resourceName string, data IReadOnlyDictionary[string, object?]);

    /// Writes a homogeneous collection. Pretty/Plain renderers use [`columns`](paramref); JSON ignores it.
    func WriteCollection(
        resourceName string,
        rows IReadOnlyList[IReadOnlyDictionary[string, object?]],
        columns IReadOnlyList[OutputColumn]
    );

    /// Writes a free-form message to the writer's stdout. Honours (cref:OutputContext.Quiet).
    func WriteMessage(message string);

    /// Writes an emphasised "this happened" line (✓ / etc.).
    func WriteSuccess(message string);
}

/// Column metadata used by Pretty/Plain rendering.
data class OutputColumn(Key string, Header string) {
    convenience init(key string) {
        init(key, key)
    }
}
