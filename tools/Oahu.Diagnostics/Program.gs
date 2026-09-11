import Oahu.Diagnostics
import System
import System.CommandLine
import System.CommandLine.Parsing
import System.Text.Json
import System.Threading
import System.Threading.Tasks

func RenderPretty(report DiagnosticReport) {
    Console.WriteLine("╭─ Oahu Diagnostics Report")
    Console.WriteLine("│  File: ${report.FilePath}")
    Console.WriteLine("│  Time: ${report.Timestamp:yyyy-MM-dd HH:mm:ss} UTC")
    Console.WriteLine("├──────────────────────────────────────────────────────────")
    for check in report.Checks {
        let icon = switch check.Severity {
            case DiagSeverity.Ok: "✓"
            case DiagSeverity.Warning: "⚠"
            case DiagSeverity.Error: "✗"
            default: "?"
        }
        let color = switch check.Severity {
            case DiagSeverity.Ok: "\u001B[32m"
            case DiagSeverity.Warning: "\u001B[33m"
            case DiagSeverity.Error: "\u001B[31m"
            default: ""
        }
        let reset = "\u001B[0m"
        Console.WriteLine("│ $color$icon$reset [${check.Id}] ${check.Title}")
        if !string.IsNullOrEmpty(check.Detail) {
            Console.WriteLine("│   ${check.Detail}")
        }
        if !string.IsNullOrEmpty(check.Hint) {
            Console.WriteLine("│   💡 ${check.Hint}")
        }
    }
    Console.WriteLine("╰──────────────────────────────────────────────────────────")
    if report.HasErrors {
        Console.WriteLine("\u001B[31m  Result: ERRORS found — see above.\u001B[0m")
    } else if report.HasWarnings {
        Console.WriteLine("\u001B[33m  Result: Warnings found — review above.\u001B[0m")
    } else {
        Console.WriteLine("\u001B[32m  Result: All checks passed.\u001B[0m")
    }
}

let fileArg = Argument[string]("file"){Description = "Path to the encrypted .aaxc or .aax file to diagnose."}

let keyOpt = Option[string?]("--key"){
    Description = "Hex-encoded 16-byte decryption key (32 hex chars) from the Audible license voucher."
}

let ivOpt = Option[string?]("--iv"){
    Description = "Hex-encoded 16-byte initialization vector (32 hex chars) from the Audible license voucher."
}

let jsonOpt = Option[bool]("--json"){Description = "Emit machine-readable JSON output."}

let exportOpt = Option[bool]("--export"){
    Description = "Attempt a full decryption and export to .m4b (requires key/IV or --asin for DB lookup)."
}

let asinOpt = Option[string?]("--asin"){
    Description = "Book ASIN for database key lookup (auto-detected from filename if omitted)."
}

let dbOpt = Option[string?]("--db"){Description = "Path to audiobooks.db (auto-detected if omitted)."}

let outputOpt = Option[string?]("--output"){
    Description = "Output .m4b file path (defaults to input path with .m4b extension)."
}

let rootCmd = RootCommand("Oahu Diagnostics — analyze encrypted audiobook files for decryption issues."){
    fileArg,
    keyOpt,
    ivOpt,
    jsonOpt,
    exportOpt,
    asinOpt,
    dbOpt,
    outputOpt
}

rootCmd.SetAction(
    async (parse ParseResult, ct CancellationToken) -> {
        let filePath = parse.GetValue(fileArg)!!
        let key = parse.GetValue(keyOpt)
        let iv = parse.GetValue(ivOpt)
        let useJson = parse.GetValue(jsonOpt)
        let doExport = parse.GetValue(exportOpt)
        let asin = parse.GetValue(asinOpt)
        let dbPath = parse.GetValue(dbOpt)
        let outputPath = parse.GetValue(outputOpt)
        let runner = DiagnosticRunner()
        var report DiagnosticReport
        if doExport {
            report = runner.RunExport(filePath, key, iv, asin, dbPath, outputPath)
        } else {
            report = runner.Run(filePath, key, iv)
        }
        if useJson {
            let options = JsonSerializerOptions{WriteIndented: true, PropertyNamingPolicy: JsonNamingPolicy.CamelCase}
            Console.WriteLine(JsonSerializer.Serialize(report, options))
        } else {
            RenderPretty(report)
        }
        await Task.CompletedTask
        return if report.HasErrors {
            1
        } else {
            0
        }
    }
)

let parseResult = rootCmd.Parse(args)
return await parseResult.InvokeAsync().ConfigureAwait(false)
