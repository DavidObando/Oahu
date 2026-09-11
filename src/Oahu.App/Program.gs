package Oahu.App.Avalonia

import Avalonia
import Oahu.BooksDatabase
import System
import System.IO

internal class Program {
    shared {
        @STAThread
        func Main(args[]string) int32 {
            if Array.IndexOf(args, "--smoke-test") >= 0 {
                return RunSmokeTest()
            }
            return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args)
        }

        func BuildAvaloniaApp() AppBuilder -> AppBuilder
            .Configure[App]()
            .UsePlatformDetect()
            .With(AvaloniaNativePlatformOptions{OverlayPopups: true})
            .WithInterFont()!!.LogToTrace()

        private func RunSmokeTest() int32 {
            let directory = Path.Combine(Path.GetTempPath(), "oahu-app-smoke-" + Guid.NewGuid().ToString("N"))
            try {
                return if BookDbContext.StartupAsync(directory, "smoke.db")!!.GetAwaiter().GetResult() {
                    0
                } else {
                    1
                }
            } finally {
                if Directory.Exists(directory) {
                    Directory.Delete(directory, recursive: true)
                }
            }
        }
    }
}
