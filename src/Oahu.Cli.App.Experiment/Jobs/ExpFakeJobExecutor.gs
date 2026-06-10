// G# port of src/Oahu.Cli.App/Jobs/FakeJobExecutor.cs.
// Implements C# IJobExecutor (returns IAsyncEnumerable[JobUpdate]).
// Uses G# async iterator (`async func ... IAsyncEnumerable[T] { yield ... }`)
// with the field-capture workaround from gsharp#655 — hoist fields into locals
// before any `yield`.

package Oahu.Cli.App.Experiment.Jobs

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models

type ExpFakeJobExecutor class : IJobExecutor {
    DelayPerPhase TimeSpan = TimeSpan.FromMilliseconds(5)
    FailAtDecrypt bool = false

    async func ExecuteAsync(request JobRequest, ct CancellationToken) IAsyncEnumerable[JobUpdate] {
        let delay = DelayPerPhase
        let failDecrypt = FailAtDecrypt
        let id = request.Id

        yield JobUpdate() { JobId = id, Phase = JobPhase.Licensing, Message = "Requesting license" }
        await Task.Delay(delay, ct)

        yield JobUpdate() { JobId = id, Phase = JobPhase.Downloading, Progress = 0.0f }
        await Task.Delay(delay, ct)
        yield JobUpdate() { JobId = id, Phase = JobPhase.Downloading, Progress = 1.0f }

        if failDecrypt {
            yield JobUpdate() { JobId = id, Phase = JobPhase.Failed, Message = "Decrypt simulated failure" }
        } else {
            yield JobUpdate() { JobId = id, Phase = JobPhase.Decrypting, Progress = 0.0f }
            await Task.Delay(delay, ct)
            yield JobUpdate() { JobId = id, Phase = JobPhase.Decrypting, Progress = 1.0f }

            yield JobUpdate() { JobId = id, Phase = JobPhase.Exporting }
            await Task.Delay(delay, ct)

            yield JobUpdate() { JobId = id, Phase = JobPhase.Completed }
        }
    }
}
