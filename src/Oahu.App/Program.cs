using System;
using System.IO;
using Avalonia;
using Oahu.BooksDatabase;

namespace Oahu.App.Avalonia
{
  class Program
  {
    [STAThread]
    public static int Main(string[] args)
    {
      if (Array.IndexOf(args, "--smoke-test") >= 0)
      {
        return RunSmokeTest();
      }

      return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp() =>
      AppBuilder.Configure<App>()
        .UsePlatformDetect()
        .With(new AvaloniaNativePlatformOptions { OverlayPopups = true })
        .WithInterFont()
        .LogToTrace();

    private static int RunSmokeTest()
    {
      var directory = Path.Combine(Path.GetTempPath(), "oahu-app-smoke-" + Guid.NewGuid().ToString("N"));
      try
      {
        return BookDbContext.StartupAsync(directory, "smoke.db").GetAwaiter().GetResult() ? 0 : 1;
      }
      finally
      {
        if (Directory.Exists(directory))
        {
          Directory.Delete(directory, recursive: true);
        }
      }
    }
  }
}
