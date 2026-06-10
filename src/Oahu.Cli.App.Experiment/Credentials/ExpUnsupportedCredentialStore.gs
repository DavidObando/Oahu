// G# port of src/Oahu.Cli.App/Credentials/UnsupportedCredentialStore.cs.
// Note: the C# version defines a custom CredentialStoreUnavailableException;
// G# 0.1.516 doesn't expose `super(...)` for class inheritance with a string-arg
// base ctor, so we use InvalidOperationException with the same message text.

package Oahu.Cli.App.Experiment.Credentials

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

type ExpUnsupportedCredentialStore class : IExpCredentialStore {
    Reason string = ""

    func Provider() string {
        return "unsupported"
    }

    func GetAsync(account string, ct CancellationToken) Task[string] {
        return Task.FromException[string](makeError())
    }

    func SetAsync(account string, secret string, ct CancellationToken) Task {
        return Task.FromException(makeError())
    }

    func DeleteAsync(account string, ct CancellationToken) Task[bool] {
        return Task.FromException[bool](makeError())
    }

    func ListAccountsAsync(ct CancellationToken) Task[IReadOnlyList[string]] {
        return Task.FromException[IReadOnlyList[string]](makeError())
    }

    func makeError() Exception {
        return InvalidOperationException("No supported credential store is available on this system: " + Reason)
    }
}

