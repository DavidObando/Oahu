// G# port of App/JsonFileQueueServiceTests.cs.
//
// LIMITATION: QueueEntry is a C# record with required init-only properties.
// Cannot construct QueueEntry instances in G# (init-only limitation). Only the
// List_Empty_When_File_Missing test is portable since it does not require
// constructing a QueueEntry.

package Oahu.Cli.Tests.Experiment.App

import System
import System.IO
import Oahu.Cli.App.Queue
import Xunit

type JsonFileQueueServiceTests class {
    tempFile string

    init() {
        tempFile = Path.Combine(Path.GetTempPath(), "oahu-cli-queue-${Guid.NewGuid().ToString("n")}.json")
    }

    func cleanup() {
        if File.Exists(tempFile) {
            File.Delete(tempFile)
        }
        let tmp = tempFile + ".tmp"
        if File.Exists(tmp) {
            File.Delete(tmp)
        }
        let lockFile = tempFile + ".lock"
        if File.Exists(lockFile) {
            File.Delete(lockFile)
        }
    }

    @Fact
    func List_Empty_When_File_Missing() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        var list = svc.ListAsync().Result
        Assert.Empty(list)
    }

    @Fact
    func Remove_Returns_False_When_Missing() {
        defer cleanup()
        var svc = JsonFileQueueService(tempFile)
        var result = svc.RemoveAsync("missing").Result
        Assert.False(result)
    }
}
