package Oahu.Cli.Tests

import System
import System.IO
import System.Linq
import Microsoft.Extensions.Logging
import Oahu.Cli.Logging
import Xunit

class RotatingFileLoggerProviderTests {
    @Fact
    func Log_WritesTodayFile() {
        let dir = Path.Combine(Path.GetTempPath(), "oahu-cli-log-test-${Guid.NewGuid():N}")
        try {
            using let provider = RotatingFileLoggerProvider(LogLevel.Debug, dir)
            let logger = provider.CreateLogger("Test.Category")
            logger.LogInformation("hello {Who}", "world")
            logger.LogWarning("warning")
            provider.Dispose() // flush
            let files = Directory.GetFiles(dir, "oahu-cli-*.log")
            Assert.Single(files)
            let contents = File.ReadAllText(files[0])
            Assert.Contains("INF [Test.Category] hello world", contents)
            Assert.Contains("WRN [Test.Category] warning", contents)
        } finally {
            if Directory.Exists(dir) {
                Directory.Delete(dir, recursive: true)
            }
        }
    }

    @Fact
    func Log_RespectsMinimumLevel() {
        let dir = Path.Combine(Path.GetTempPath(), "oahu-cli-log-test-${Guid.NewGuid():N}")
        try {
            using let provider = RotatingFileLoggerProvider(LogLevel.Warning, dir)
            let logger = provider.CreateLogger("X")
            logger.LogInformation("info")
            logger.LogError("err")
            provider.Dispose()
            let contents = File.ReadAllText(Directory.GetFiles(dir).Single())
            Assert.DoesNotContain("info", contents)
            Assert.Contains("err", contents)
        } finally {
            if Directory.Exists(dir) {
                Directory.Delete(dir, recursive: true)
            }
        }
    }
}
