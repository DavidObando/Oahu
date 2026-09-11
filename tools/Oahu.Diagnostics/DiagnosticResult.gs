package Oahu.Diagnostics

import System
import System.Collections.Generic
import System.Linq
import System.Text.Json.Serialization

/// Severity levels mirroring oahu-cli doctor's DoctorSeverity.
@JsonConverter(typeof(JsonStringEnumConverter))
enum DiagSeverity {
    Ok,
    Warning,
    Error
}

/// A single diagnostic check result, modeled after DoctorCheck for future CLI integration.
data class DiagnosticCheck {
    prop Id string {
        get;
        init;
    }

    prop Title string {
        get;
        init;
    }

    prop Severity DiagSeverity {
        get;
        init;
    }

    prop Detail string? {
        get;
        init;
    }

    prop Hint string? {
        get;
        init;
    }
}

/// Complete diagnostic report for one file.
data class DiagnosticReport {
    prop FilePath string {
        get;
        init;
    }

    prop Timestamp DateTimeOffset {
        get;
        init;
    }

    prop Checks List[DiagnosticCheck] {
        get;
        init;
    }

    @JsonIgnore
    prop HasErrors bool -> Checks.Any((c DiagnosticCheck) -> c.Severity == DiagSeverity.Error)

    @JsonIgnore
    prop HasWarnings bool -> Checks.Any((c DiagnosticCheck) -> c.Severity == DiagSeverity.Warning)
}
