using System;
using System.CommandLine;
using System.CommandLine.Parsing;
using System.Text.Json;
using System.Threading.Tasks;

namespace Oahu.Diagnostics;

/// <summary>
/// Entry point for <c>oahu-diag</c>.
/// </summary>
public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        var fileArg = new Argument<string>("file") { Description = "Path to the encrypted .aaxc or .aax file to diagnose." };

        var keyOpt = new Option<string?>("--key") { Description = "Hex-encoded 16-byte decryption key (32 hex chars) from the Audible license voucher." };
        var ivOpt = new Option<string?>("--iv") { Description = "Hex-encoded 16-byte initialization vector (32 hex chars) from the Audible license voucher." };
        var jsonOpt = new Option<bool>("--json") { Description = "Emit machine-readable JSON output." };
        var exportOpt = new Option<bool>("--export") { Description = "Attempt a full decryption and export to .m4b (requires key/IV or --asin for DB lookup)." };
        var asinOpt = new Option<string?>("--asin") { Description = "Book ASIN for database key lookup (auto-detected from filename if omitted)." };
        var dbOpt = new Option<string?>("--db") { Description = "Path to audiobooks.db (auto-detected if omitted)." };
        var outputOpt = new Option<string?>("--output") { Description = "Output .m4b file path (defaults to input path with .m4b extension)." };

        var rootCmd = new RootCommand("Oahu Diagnostics — analyze encrypted audiobook files for decryption issues.")
        {
            fileArg,
            keyOpt,
            ivOpt,
            jsonOpt,
            exportOpt,
            asinOpt,
            dbOpt,
            outputOpt,
        };

        rootCmd.SetAction(async (parse, ct) =>
        {
            var filePath = parse.GetValue(fileArg)!;
            var key = parse.GetValue(keyOpt);
            var iv = parse.GetValue(ivOpt);
            var useJson = parse.GetValue(jsonOpt);
            var doExport = parse.GetValue(exportOpt);
            var asin = parse.GetValue(asinOpt);
            var dbPath = parse.GetValue(dbOpt);
            var outputPath = parse.GetValue(outputOpt);

            var runner = new DiagnosticRunner();
            DiagnosticReport report;

            if (doExport)
            {
                report = runner.RunExport(filePath, key, iv, asin, dbPath, outputPath);
            }
            else
            {
                report = runner.Run(filePath, key, iv);
            }

            if (useJson)
            {
                var options = new JsonSerializerOptions
                {
                    WriteIndented = true,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                };
                Console.WriteLine(JsonSerializer.Serialize(report, options));
            }
            else
            {
                RenderPretty(report);
            }

            await Task.CompletedTask;
            return report.HasErrors ? 1 : 0;
        });

        var parseResult = rootCmd.Parse(args);
        return await parseResult.InvokeAsync().ConfigureAwait(false);
    }

    private static void RenderPretty(DiagnosticReport report)
    {
        Console.WriteLine($"╭─ Oahu Diagnostics Report");
        Console.WriteLine($"│  File: {report.FilePath}");
        Console.WriteLine($"│  Time: {report.Timestamp:yyyy-MM-dd HH:mm:ss} UTC");
        Console.WriteLine("├──────────────────────────────────────────────────────────");

        foreach (var check in report.Checks)
        {
            var icon = check.Severity switch
            {
                DiagSeverity.Ok => "✓",
                DiagSeverity.Warning => "⚠",
                DiagSeverity.Error => "✗",
                _ => "?",
            };

            var color = check.Severity switch
            {
                DiagSeverity.Ok => "\x1b[32m",
                DiagSeverity.Warning => "\x1b[33m",
                DiagSeverity.Error => "\x1b[31m",
                _ => "",
            };
            var reset = "\x1b[0m";

            Console.WriteLine($"│ {color}{icon}{reset} [{check.Id}] {check.Title}");
            if (!string.IsNullOrEmpty(check.Detail))
            {
                Console.WriteLine($"│   {check.Detail}");
            }

            if (!string.IsNullOrEmpty(check.Hint))
            {
                Console.WriteLine($"│   💡 {check.Hint}");
            }
        }

        Console.WriteLine("╰──────────────────────────────────────────────────────────");

        if (report.HasErrors)
        {
            Console.WriteLine("\x1b[31m  Result: ERRORS found — see above.\x1b[0m");
        }
        else if (report.HasWarnings)
        {
            Console.WriteLine("\x1b[33m  Result: Warnings found — review above.\x1b[0m");
        }
        else
        {
            Console.WriteLine("\x1b[32m  Result: All checks passed.\x1b[0m");
        }
    }
}
