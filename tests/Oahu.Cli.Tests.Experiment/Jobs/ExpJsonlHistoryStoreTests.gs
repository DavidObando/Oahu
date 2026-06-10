// Sanity tests for ExpJsonlHistoryStore.

package Oahu.Cli.Tests.Experiment.Jobs

import Xunit
import System
import System.Collections.Generic
import System.IO
import Oahu.Cli.App.Models
import Oahu.Cli.App.Experiment.Jobs

type ExpJsonlHistoryStoreTests class {
    func makeStore() ExpJsonlHistoryStore {
        let path = Path.Combine(Path.GetTempPath(), "oahu-exp-jsonl-" + Guid.NewGuid().ToString("n") + ".jsonl")
        return ExpJsonlHistoryStore() { FilePath = path }
    }

    func makeRecord(id string, asin string, completedAt DateTimeOffset) JobRecord {
        return JobRecord() {
            Id = id, Asin = asin, Title = "T-" + id,
            TerminalPhase = JobPhase.Completed,
            StartedAt = completedAt.AddSeconds(-10),
            CompletedAt = completedAt
        }
    }

    @Fact
    func ReadAll_Empty_When_File_Missing() {
        let s = makeStore()
        let list = s.ReadAll()
        Assert.Empty(list)
    }

    @Fact
    func Append_Then_ReadAll_Roundtrip() {
        let s = makeStore()
        try {
            let now = DateTimeOffset.UtcNow
            s.Append(makeRecord("j1", "A1", now))
            s.Append(makeRecord("j2", "A2", now.AddMinutes(1)))
            let list = s.ReadAll()
            Assert.Equal[int32](2, int32(list.Count))
            Assert.Equal("j1", list[0].Id)
            Assert.Equal("j2", list[1].Id)
        } finally {
            if File.Exists(s.FilePath) { File.Delete(s.FilePath) }
        }
    }

    @Fact
    func Delete_By_Asin_Removes_Matches() {
        let s = makeStore()
        try {
            let now = DateTimeOffset.UtcNow
            s.Append(makeRecord("j1", "A1", now))
            s.Append(makeRecord("j2", "A2", now.AddMinutes(1)))
            s.Append(makeRecord("j3", "A1", now.AddMinutes(2)))
            let asins = List[string]()
            asins.Add("A1")
            let removed = s.Delete(asins, Nullable[DateTimeOffset](), Nullable[int32]())
            Assert.Equal[int32](2, removed)
            let after = s.ReadAll()
            Assert.Equal[int32](1, int32(after.Count))
            Assert.Equal("A2", after[0].Asin)
        } finally {
            if File.Exists(s.FilePath) { File.Delete(s.FilePath) }
        }
    }

    @Fact
    func Delete_By_Before_Removes_Older() {
        let s = makeStore()
        try {
            let base = DateTimeOffset.UtcNow
            s.Append(makeRecord("j1", "A1", base.AddMinutes(-10)))
            s.Append(makeRecord("j2", "A2", base.AddMinutes(-5)))
            s.Append(makeRecord("j3", "A3", base.AddMinutes(0)))
            let cutoff = Nullable[DateTimeOffset](base.AddMinutes(-2))
            let removed = s.Delete(nil, cutoff, Nullable[int32]())
            Assert.Equal[int32](2, removed)
            let after = s.ReadAll()
            Assert.Equal[int32](1, int32(after.Count))
            Assert.Equal("j3", after[0].Id)
        } finally {
            if File.Exists(s.FilePath) { File.Delete(s.FilePath) }
        }
    }

    @Fact
    func Delete_By_Keep_Retains_Most_Recent() {
        let s = makeStore()
        try {
            let base = DateTimeOffset.UtcNow
            s.Append(makeRecord("j1", "A1", base.AddMinutes(-3)))
            s.Append(makeRecord("j2", "A2", base.AddMinutes(-2)))
            s.Append(makeRecord("j3", "A3", base.AddMinutes(-1)))
            s.Append(makeRecord("j4", "A4", base))
            let removed = s.Delete(nil, Nullable[DateTimeOffset](), Nullable[int32](2))
            Assert.Equal[int32](2, removed)
            let after = s.ReadAll()
            Assert.Equal[int32](2, int32(after.Count))
            Assert.Equal("j3", after[0].Id)
            Assert.Equal("j4", after[1].Id)
        } finally {
            if File.Exists(s.FilePath) { File.Delete(s.FilePath) }
        }
    }

    @Fact
    func Append_Creates_Directory_If_Missing() {
        let nested = Path.Combine(Path.GetTempPath(), "oahu-exp-jsonl-" + Guid.NewGuid().ToString("n"), "history.jsonl")
        let s = ExpJsonlHistoryStore() { FilePath = nested }
        try {
            s.Append(makeRecord("j1", "A1", DateTimeOffset.UtcNow))
            Assert.True(File.Exists(nested))
        } finally {
            if File.Exists(nested) { File.Delete(nested) }
            let dir = Path.GetDirectoryName(nested)
            if !String.IsNullOrEmpty(dir) && Directory.Exists(dir!!) {
                Directory.Delete(dir!!, true)
            }
        }
    }
}
