package Oahu.Cli.Tests.App

import Oahu.Cli.App.Jobs
import Oahu.Cli.App.Models
import System
import System.Collections.Generic
import System.IO
import System.Threading
import System.Threading.Tasks
import Xunit

class JsonlHistoryStoreTests : IDisposable {
    private let directory string = Path.Combine(Path.GetTempPath(), "oahu-history-reader-" + Guid.NewGuid().ToString("N"))
    private let path string
    private let store JsonlHistoryStore

    init() {
        Directory.CreateDirectory(directory)
        path = Path.Combine(directory, "history.jsonl")
        store = JsonlHistoryStore(path)
    }

    func Dispose() {
        Directory.Delete(directory, recursive: true)
    }

    @Fact
    async func Concurrent_Blocking_Readers_Do_Not_Dispose_InFlight_File_Reads() {
        store.Append(JobRecord{Id: "one", Asin: "one", Title: "One", TerminalPhase: JobPhase.Completed})
        let workers = List[Task]()
        for var worker = 0; worker < 8; worker++ {
            workers.Add(Task.Factory.StartNew(() -> {
                for var iteration = 0; iteration < 4096; iteration++ {
                    let enumerator = store.ReadAllAsync().GetAsyncEnumerator()
                    try {
                        var count = 0
                        while enumerator.MoveNextAsync().AsTask().GetAwaiter().GetResult() {
                            Assert.Equal("one", enumerator.Current.Id)
                            count++
                        }
                        Assert.Equal(1, count)
                    } finally {
                        enumerator.DisposeAsync().AsTask().GetAwaiter().GetResult()
                    }
                }
            }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default))
        }
        await Task.WhenAll(workers)
    }

    @Fact
    async func Enumeration_Is_Lazy_Reusable_And_Releases_The_File_At_Eof() {
        let history = store.ReadAllAsync()
        let enumerator = history.GetAsyncEnumerator()
        store.Append(JobRecord{Id: "one", Asin: "one", Title: "One", TerminalPhase: JobPhase.Completed})
        try {
            Assert.True(await enumerator.MoveNextAsync())
            Assert.Equal("one", enumerator.Current.Id)
            Assert.False(await enumerator.MoveNextAsync())
            Assert.False(await enumerator.MoveNextAsync())
            using let exclusive = FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None)
        } finally {
            await enumerator.DisposeAsync()
        }
        store.Append(JobRecord{Id: "two", Asin: "two", Title: "Two", TerminalPhase: JobPhase.Completed})
        let ids = List[string]()
        await for record in history { ids.Add(record.Id) }
        Assert.Equal([]string{"one", "two"}, ids.ToArray())
    }

    @Fact
    async func Early_Disposal_Is_Idempotent_And_Releases_The_File() {
        store.Append(JobRecord{Id: "one", Asin: "one", Title: "One", TerminalPhase: JobPhase.Completed})
        store.Append(JobRecord{Id: "two", Asin: "two", Title: "Two", TerminalPhase: JobPhase.Completed})
        let enumerator = store.ReadAllAsync().GetAsyncEnumerator()
        try {
            Assert.True(await enumerator.MoveNextAsync())
        } finally {
            await enumerator.DisposeAsync()
        }
        await enumerator.DisposeAsync()
        Assert.False(await enumerator.MoveNextAsync())
        using let exclusive = FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None)
    }

    @Theory
    @InlineData(true)
    @InlineData(false)
    async func Either_Cancellation_Token_Stops_Reading_And_Releases_The_File(cancelInitial bool) {
        store.Append(JobRecord{Id: "one", Asin: "one", Title: "One", TerminalPhase: JobPhase.Completed})
        store.Append(JobRecord{Id: "two", Asin: "two", Title: "Two", TerminalPhase: JobPhase.Completed})
        using let initial = CancellationTokenSource()
        using let consumer = CancellationTokenSource()
        let enumerator = store.ReadAllAsync(initial.Token).GetAsyncEnumerator(consumer.Token)
        try {
            Assert.True(await enumerator.MoveNextAsync())
            if cancelInitial { initial.Cancel() } else { consumer.Cancel() }
            await Assert.ThrowsAnyAsync[OperationCanceledException](async () -> {
                await enumerator.MoveNextAsync()
            })
            using let exclusive = FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None)
        } finally {
            await enumerator.DisposeAsync()
        }
    }

    @Fact
    async func Missing_History_Is_Empty() {
        let enumerator = store.ReadAllAsync().GetAsyncEnumerator()
        try {
            Assert.False(await enumerator.MoveNextAsync())
        } finally {
            await enumerator.DisposeAsync()
        }
        Assert.False(File.Exists(path))
    }

    @Fact
    async func Blank_Null_And_Torn_Records_Are_Skipped_Without_Closing_The_Reader() {
        store.Append(JobRecord{Id: "one", Asin: "one", Title: "One", TerminalPhase: JobPhase.Completed})
        File.AppendAllText(path, "\nnull\n{\"id\":\n")
        store.Append(JobRecord{Id: "two", Asin: "two", Title: "Two", TerminalPhase: JobPhase.Completed})
        let ids = List[string]()
        await for record in store.ReadAllAsync() { ids.Add(record.Id) }
        Assert.Equal([]string{"one", "two"}, ids.ToArray())
    }
}
