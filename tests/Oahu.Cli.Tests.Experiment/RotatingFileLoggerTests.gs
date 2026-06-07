// G# port of RotatingFileLoggerTests.cs.
//
// Covers RotatingFileLoggerProvider: writing to a daily file and
// respecting minimum log level.
//
// WORKAROUNDS:
//   - CLR string[] not indexable in G# (known limitation). Use Assert.Single()
//     to extract the single element, or Enumerable.First().

package Oahu.Cli.Tests.Experiment

import System
import System.IO
import System.Linq
import Microsoft.Extensions.Logging
import Oahu.Cli.Logging
import Xunit

type RotatingFileLoggerProviderTests class {
    @Fact
    func Log_WritesTodayFile() {
        var dir = Path.Combine(Path.GetTempPath(), "oahu-cli-log-test-" + Guid.NewGuid().ToString())
        try {
            var provider = RotatingFileLoggerProvider(LogLevel.Debug, dir)
            var logger = provider.CreateLogger("Test.Category")
            logger.LogInformation("hello {Who}", "world")
            logger.LogWarning("warning")
            provider.Dispose()

            var files = Directory.GetFiles(dir, "oahu-cli-*.log")
            var file = Assert.Single(files)
            var contents = File.ReadAllText(file)
            Assert.Contains("INF [Test.Category] hello world", contents)
            Assert.Contains("WRN [Test.Category] warning", contents)
        } finally {
            if Directory.Exists(dir) {
                Directory.Delete(dir, true)
            }
        }
    }

    @Fact
    func Log_RespectsMinimumLevel() {
        var dir = Path.Combine(Path.GetTempPath(), "oahu-cli-log-test-" + Guid.NewGuid().ToString())
        try {
            var provider = RotatingFileLoggerProvider(LogLevel.Warning, dir)
            var logger = provider.CreateLogger("X")
            logger.LogInformation("info")
            logger.LogError("err")
            provider.Dispose()

            var files = Directory.GetFiles(dir)
            var file = Enumerable.First(files)
            var contents = File.ReadAllText(file)
            Assert.DoesNotContain("info", contents)
            Assert.Contains("err", contents)
        } finally {
            if Directory.Exists(dir) {
                Directory.Delete(dir, true)
            }
        }
    }
}
