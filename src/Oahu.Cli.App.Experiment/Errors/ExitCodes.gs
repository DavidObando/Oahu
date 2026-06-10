// G# port of src/Oahu.Cli.App/Errors/ExitCodes.cs.
// G# does not support `const` inside `type class`; in 0.1.516 we expose the
// codes as instance fields on a class. Tests construct an ExitCodes() value
// to read them. The shared C# Oahu.Cli.App project still owns the static
// const surface that downstream commands actually consume — this experimental
// type is purely a G# parallel.

package Oahu.Cli.App.Experiment.Errors

type ExitCodes class {
    Success int32 = 0
    GenericFailure int32 = 1
    UsageError int32 = 2
    AuthError int32 = 3
    AudibleApiError int32 = 4
    DecryptError int32 = 5
    Locked int32 = 6
    Cancelled int32 = 130
}
