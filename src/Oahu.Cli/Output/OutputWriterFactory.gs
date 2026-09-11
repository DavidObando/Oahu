package Oahu.Cli.Output

import Spectre.Console
import System
import System.IO

/// Builds the right (cref:IOutputWriter) for the requested format. Test code
/// can substitute the underlying (cref:TextWriter) / (cref:IAnsiConsole).
class OutputWriterFactory {
    shared {
        func Create(context OutputContext, writer TextWriter? = nil, console IAnsiConsole? = nil) IOutputWriter {
            return switch context.Format {
                case OutputFormat.Json: cast[IOutputWriter](JsonOutputWriter(context, writer ?? Console.Out))
                case OutputFormat.Plain: cast[IOutputWriter](PlainOutputWriter(context, writer ?? Console.Out))
                case OutputFormat.Pretty: cast[IOutputWriter](
                    PrettyOutputWriter(context, console ?? AnsiConsole.Console)
                )
                default: cast[IOutputWriter](PlainOutputWriter(context, writer ?? Console.Out))
            }
        }
    }
}
