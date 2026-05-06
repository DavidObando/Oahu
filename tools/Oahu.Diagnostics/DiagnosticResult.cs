using System.Text.Json.Serialization;

namespace Oahu.Diagnostics;

/// <summary>Severity levels mirroring oahu-cli doctor's DoctorSeverity.</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum DiagSeverity
{
    Ok,
    Warning,
    Error,
}

/// <summary>A single diagnostic check result, modeled after DoctorCheck for future CLI integration.</summary>
public sealed record DiagnosticCheck
{
    public required string Id { get; init; }

    public required string Title { get; init; }

    public required DiagSeverity Severity { get; init; }

    public string? Detail { get; init; }

    public string? Hint { get; init; }
}

/// <summary>Complete diagnostic report for one file.</summary>
public sealed record DiagnosticReport
{
    public required string FilePath { get; init; }

    public required DateTimeOffset Timestamp { get; init; }

    public required List<DiagnosticCheck> Checks { get; init; }

    [JsonIgnore]
    public bool HasErrors => Checks.Any(c => c.Severity == DiagSeverity.Error);

    [JsonIgnore]
    public bool HasWarnings => Checks.Any(c => c.Severity == DiagSeverity.Warning);
}
