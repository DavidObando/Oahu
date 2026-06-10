// Sanity tests for ExpFakeJobExecutor and ExpCliCancellation.

package Oahu.Cli.Tests.Experiment.Jobs

import Xunit
import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import System.Linq
import Oahu.Core
import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import Oahu.Cli.App.Experiment.Jobs

type ExpFakeJobExecutorTests class {
    async func collect(exec IJobExecutor, req JobRequest) List[JobUpdate] {
        var list = List[JobUpdate]()
        let en = exec.ExecuteAsync(req, CancellationToken.None).GetAsyncEnumerator(CancellationToken.None)
        var hasMore = en.MoveNextAsync().AsTask().GetAwaiter().GetResult()
        for hasMore {
            list.Add(en.Current)
            hasMore = en.MoveNextAsync().AsTask().GetAwaiter().GetResult()
        }
        en.DisposeAsync().AsTask().GetAwaiter().GetResult()
        return list
    }

    func makeReq() JobRequest {
        return JobRequest() { Id = "j1", Asin = "A1", Quality = DownloadQuality.High }
    }

    @Fact
    func Run_Yields_Completion() {
        var exec = ExpFakeJobExecutor() { DelayPerPhase = TimeSpan.FromMilliseconds(1) }
        var updates = collect(exec, makeReq()).Result
        Assert.True(updates.Count >= 6)
        Assert.Equal[JobPhase](JobPhase.Completed, updates[updates.Count - 1].Phase)
    }

    @Fact
    func Run_With_Failure_Stops_At_Failed() {
        var exec = ExpFakeJobExecutor() { DelayPerPhase = TimeSpan.FromMilliseconds(1), FailAtDecrypt = true }
        var updates = collect(exec, makeReq()).Result
        Assert.Equal[JobPhase](JobPhase.Failed, updates[updates.Count - 1].Phase)
    }

    @Fact
    func Run_First_Update_Is_Licensing() {
        var exec = ExpFakeJobExecutor() { DelayPerPhase = TimeSpan.FromMilliseconds(1) }
        var updates = collect(exec, makeReq()).Result
        Assert.Equal[JobPhase](JobPhase.Licensing, updates[0].Phase)
    }

    @Fact
    func Run_Job_Id_Propagated() {
        var exec = ExpFakeJobExecutor() { DelayPerPhase = TimeSpan.FromMilliseconds(1) }
        var updates = collect(exec, makeReq()).Result
        for u in updates {
            Assert.Equal("j1", u.JobId)
        }
    }

    @Fact
    func Implements_Interface() {
        var exec = ExpFakeJobExecutor()
        Assert.IsAssignableFrom[IJobExecutor](exec)
    }
}

type ExpCliCancellationTests class {
    @Fact
    func Stores_Token() {
        var cts = CancellationTokenSource()
        var c = ExpCliCancellation() { Token = cts.Token }
        Assert.Equal[CancellationToken](cts.Token, c.CancellationToken)
    }

    @Fact
    func Implements_Interface() {
        var c = ExpCliCancellation()
        Assert.IsAssignableFrom[ICancellation](c)
    }
}
