using Oahu.Decrypt;
using Oahu.Decrypt.Mpeg4;
using Oahu.Decrypt.Mpeg4.Boxes;

namespace Oahu.Diagnostics.Checks;

/// <summary>
/// Attempts to parse the MPEG-4 top-level box structure.
/// Reports whether ftyp, moov, and mdat are present and intact.
/// This is the most critical check: a truncated download will fail here.
/// </summary>
public static class Mpeg4StructureCheck
{
    public static List<DiagnosticCheck> Run(string filePath)
    {
        var results = new List<DiagnosticCheck>();

        try
        {
            using var stream = File.OpenRead(filePath);

            // Phase 1: Can we read the top-level boxes at all?
            List<IBox> boxes;
            try
            {
                boxes = Oahu.Decrypt.Mpeg4.Util.Mpeg4Util.LoadTopLevelBoxes(stream);
            }
            catch (EndOfStreamException ex)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "mpeg4-parse",
                    Title = "MPEG-4 top-level box parsing",
                    Severity = DiagSeverity.Error,
                    Detail = $"Premature end of stream during parsing: {ex.Message}",
                    Hint = "The file is likely truncated — the download was interrupted before completing. Re-download the book.",
                });
                return results;
            }
            catch (Exception ex)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "mpeg4-parse",
                    Title = "MPEG-4 top-level box parsing",
                    Severity = DiagSeverity.Error,
                    Detail = $"Failed to parse top-level boxes: {ex.GetType().Name}: {ex.Message}",
                    Hint = "The file may be corrupt or not a valid MPEG-4 container.",
                });
                return results;
            }

            results.Add(new DiagnosticCheck
            {
                Id = "mpeg4-parse",
                Title = "MPEG-4 top-level box parsing",
                Severity = DiagSeverity.Ok,
                Detail = $"Found {boxes.Count} top-level boxes: [{string.Join(", ", boxes.Select(b => b.Header.Type))}]",
            });

            // Phase 2: Check for required boxes.
            var ftyp = boxes.OfType<FtypBox>().FirstOrDefault();
            var moov = boxes.OfType<MoovBox>().FirstOrDefault();
            var mdat = boxes.OfType<MdatBox>().FirstOrDefault();

            if (ftyp is null)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "mpeg4-ftyp",
                    Title = "ftyp box present",
                    Severity = DiagSeverity.Error,
                    Detail = "Missing ftyp box — cannot determine file type.",
                });
            }
            else
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "mpeg4-ftyp",
                    Title = "ftyp box present",
                    Severity = DiagSeverity.Ok,
                    Detail = $"MajorBrand={ftyp.MajorBrand.Trim()}, Brands=[{string.Join(", ", ftyp.CompatibleBrands.Select(b => b.Trim()))}]",
                });
            }

            if (moov is null)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "mpeg4-moov",
                    Title = "moov box present",
                    Severity = DiagSeverity.Error,
                    Detail = "Missing moov box — file metadata is not present. File is likely severely truncated.",
                    Hint = "Re-download the book.",
                });
            }
            else
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "mpeg4-moov",
                    Title = "moov box present",
                    Severity = DiagSeverity.Ok,
                    Detail = "moov box found.",
                });
            }

            if (mdat is null)
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "mpeg4-mdat",
                    Title = "mdat box present",
                    Severity = DiagSeverity.Error,
                    Detail = "Missing mdat box — audio data is not present. File is likely truncated.",
                    Hint = "Re-download the book.",
                });
            }
            else
            {
                results.Add(new DiagnosticCheck
                {
                    Id = "mpeg4-mdat",
                    Title = "mdat box present",
                    Severity = DiagSeverity.Ok,
                    Detail = $"mdat box found (header size: {mdat.Header.TotalBoxSize} bytes).",
                });
            }
        }
        catch (Exception ex)
        {
            results.Add(new DiagnosticCheck
            {
                Id = "mpeg4-parse",
                Title = "MPEG-4 top-level box parsing",
                Severity = DiagSeverity.Error,
                Detail = $"Unexpected error: {ex.GetType().Name}: {ex.Message}",
            });
        }

        return results;
    }
}
