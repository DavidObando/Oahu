// G# port of src/Oahu.Cli.App/Jobs/CliCancellation.cs.
// Reuses C# Oahu.Core.ICancellation interface.

package Oahu.Cli.App.Experiment.Jobs

import System.Threading
import Oahu.Core

type ExpCliCancellation class : ICancellation {
    Token CancellationToken = CancellationToken.None

    prop CancellationToken CancellationToken {
        get { return Token }
    }
}
