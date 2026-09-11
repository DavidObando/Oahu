package Oahu.Cli.App.Doctor

import System
import System.Collections.Generic

/// Severity of an individual (cref:DoctorCheck).
enum DoctorSeverity {
    Ok,
    Warning,
    Error
}

/// One environment check executed by (cref:IDoctorService).
data class DoctorCheck(Id string, Title string, Severity DoctorSeverity, Message string, Hint string? = nil) { }

/// Aggregate result returned by (cref:IDoctorService.RunAsync).
class DoctorReport {
    init(checks IReadOnlyList[DoctorCheck]) {
        Checks = checks ?? throw ArgumentNullException("checks")
    }

    prop Checks IReadOnlyList[DoctorCheck] {
        get;
        init;
    }

    prop HasErrors bool {
        get {
            for c in Checks {
                if c.Severity == DoctorSeverity.Error {
                    return true
                }
            }
            return false
        }
    }

    prop HasWarnings bool {
        get {
            for c in Checks {
                if c.Severity == DoctorSeverity.Warning {
                    return true
                }
            }
            return false
        }
    }
}
