package Oahu.Diagnostics.Checks

import Oahu.Decrypt
import Oahu.Decrypt.Mpeg4
import Oahu.Decrypt.Mpeg4.Boxes
import Oahu.Decrypt.Mpeg4.Util
import Oahu.Diagnostics
import System
import System.Collections.Generic
import System.IO
import System.Linq

/// Attempts to parse the MPEG-4 top-level box structure.
/// Reports whether ftyp, moov, and mdat are present and intact.
/// This is the most critical check: a truncated download will fail here.
class Mpeg4StructureCheck {
    shared {
        func Run(filePath string) List[DiagnosticCheck] {
            let results = List[DiagnosticCheck]()
            try {
                using let stream = File.OpenRead(filePath)
                // Phase 1: Can we read the top-level boxes at all?
                var boxes List[IBox]
                try {
                    boxes = Mpeg4Util.LoadTopLevelBoxes(stream)
                } catch (ex EndOfStreamException) {
                    results.Add(
                        DiagnosticCheck{
                            Id: "mpeg4-parse",
                            Title: "MPEG-4 top-level box parsing",
                            Severity: DiagSeverity.Error,
                            Detail: "Premature end of stream during parsing: ${ex.Message}",
                            Hint: "The file is likely truncated — the download was interrupted before completing. Re-download the book."
                        }
                    )
                    return results
                } catch (ex Exception) {
                    results.Add(
                        DiagnosticCheck{
                            Id: "mpeg4-parse",
                            Title: "MPEG-4 top-level box parsing",
                            Severity: DiagSeverity.Error,
                            Detail: "Failed to parse top-level boxes: ${ex.GetType().Name}: ${ex.Message}",
                            Hint: "The file may be corrupt or not a valid MPEG-4 container."
                        }
                    )
                    return results
                }
                results.Add(
                    DiagnosticCheck{
                        Id: "mpeg4-parse",
                        Title: "MPEG-4 top-level box parsing",
                        Severity: DiagSeverity.Ok,
                        Detail: "Found ${boxes.Count} top-level boxes: [${string.Join(", ", boxes.Select((b IBox) -> b.Header.Type))}]"
                    }
                )
                // Phase 2: Check for required boxes.
                let ftyp FtypBox? = boxes.OfType[FtypBox]().FirstOrDefault()
                let moov MoovBox? = boxes.OfType[MoovBox]().FirstOrDefault()
                let mdat MdatBox? = boxes.OfType[MdatBox]().FirstOrDefault()
                if ftyp == nil {
                    results.Add(
                        DiagnosticCheck{
                            Id: "mpeg4-ftyp",
                            Title: "ftyp box present",
                            Severity: DiagSeverity.Error,
                            Detail: "Missing ftyp box — cannot determine file type."
                        }
                    )
                } else {
                    results.Add(
                        DiagnosticCheck{
                            Id: "mpeg4-ftyp",
                            Title: "ftyp box present",
                            Severity: DiagSeverity.Ok,
                            Detail: "MajorBrand=${ftyp.MajorBrand.Trim()}, Brands=[${string.Join(", ", ftyp.CompatibleBrands.Select((b string) -> b.Trim()))}]"
                        }
                    )
                }
                if moov == nil {
                    results.Add(
                        DiagnosticCheck{
                            Id: "mpeg4-moov",
                            Title: "moov box present",
                            Severity: DiagSeverity.Error,
                            Detail: "Missing moov box — file metadata is not present. File is likely severely truncated.",
                            Hint: "Re-download the book."
                        }
                    )
                } else {
                    results.Add(
                        DiagnosticCheck{
                            Id: "mpeg4-moov",
                            Title: "moov box present",
                            Severity: DiagSeverity.Ok,
                            Detail: "moov box found."
                        }
                    )
                }
                if mdat == nil {
                    results.Add(
                        DiagnosticCheck{
                            Id: "mpeg4-mdat",
                            Title: "mdat box present",
                            Severity: DiagSeverity.Error,
                            Detail: "Missing mdat box — audio data is not present. File is likely truncated.",
                            Hint: "Re-download the book."
                        }
                    )
                } else {
                    results.Add(
                        DiagnosticCheck{
                            Id: "mpeg4-mdat",
                            Title: "mdat box present",
                            Severity: DiagSeverity.Ok,
                            Detail: "mdat box found (header size: ${mdat.Header.TotalBoxSize} bytes)."
                        }
                    )
                }
            } catch (ex Exception) {
                results.Add(
                    DiagnosticCheck{
                        Id: "mpeg4-parse",
                        Title: "MPEG-4 top-level box parsing",
                        Severity: DiagSeverity.Error,
                        Detail: "Unexpected error: ${ex.GetType().Name}: ${ex.Message}"
                    }
                )
            }
            return results
        }
    }
}
